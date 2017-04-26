import async from 'async';
import urlUtil from 'url';
import querystring from 'querystring';
import util from 'util';
import crypto from 'crypto';

import RedisClient from './../lib/redis_client_init';
import Redis from './../lib/redis';
import Util from './../lib/util';

export default class PipeLine {
  constructor(spiderCore) {
    this.spiderCore = spiderCore;
    this.logger = spiderCore.settings.logger;
    this.settings = spiderCore.settings;
  }

  assembly = async () => {
    await RedisClient.init(this.settings);
    this.drillerInfoDb = Redis.getClient('drillerInfoDb');
    this.urlInfoDb = Redis.getClient('urlInfoDb');
    this.urlReportDb = Redis.getClient('urlReportDb');
  }

  save = async (extracted_info) => {
    try {
      if (this.spiderCore.settings['test']) {

      } else {
        if (extracted_info['drill_link']) {
          this.save_links(
            extracted_info['url'],
            extracted_info['origin']['version'],
            extracted_info['drill_link'],
            extracted_info['drill_relation']
          );
        }

        if (this.spiderCore.settings['save_content_to_mongodb']) {
          let html_content = extracted_info['content'];
          if (!extracted_info['origin']['save_page']) html_content = '';

          this.save_content(
            extracted_info['url'],
            html_content,
            extracted_info['extracted_data'],
            extracted_info['js_result'],
            extracted_info['origin']['referer'],
            extracted_info['origin']['urllib'],
            extracted_info['drill_relation']
          );
        }

        if ('pipeline' in this.spiderCore.spider_extend) {
          await this.spiderCore.spider_extend.pipeline(extracted_info);
        }
      }

      this.logger.info(`${extracted_info['url']}, pipeline completed`);
    } catch (err) {
      this.logger.error('pipeline save err = ', err);
    }
  }

  save_links = async (page_url, version, linkobjs, drill_relation) => new Promise((resolve, reject) => {
    const spiderCore = this.spiderCore;
    const drillerInfoDb = this.drillerInfoDb;
    const urlInfoDb = this.urlInfoDb;

    const aliasArr = Object.keys(linkobjs);
    let linkCount = 0;
    let index = 0;

    if (!version) version = (new Date()).getTime();

    async.whilst(
      () => index < aliasArr.length,
      (cb) => {
        const alias = aliasArr[index];
        const links = linkobjs[alias];
        const t_alias_arr = alias.split(':');
        const drill_alias = t_alias_arr[3];
        const domain = t_alias_arr[2];

        if (!spiderCore.spider.driller_rules[domain] || !spiderCore.spider.driller_rules[domain][drill_alias]) {
          this.logger.error(`${alias} not in configuration`);
          return cb(new Error('Drill rule not found'));
        }

        let t_driller_rules = spiderCore.spider.driller_rules[domain][drill_alias];

        if (typeof(t_driller_rules) !== 'object') t_driller_rules = JSON.parse(t_driller_rules);

        let sindex = 0;

        async.whilst(
          () => sindex < links.length,
          (sub_cb) => {
            const link = links[sindex];
            linkCount++;

            async.waterfall([
              (water_cb) => {
                try {
                  let final_link = link;
                  const urlobj = urlUtil.parse(link);

                  if (t_driller_rules['id_parameter']) {
                    let id_parameter = t_driller_rules['id_parameter'];

                    if (typeof(id_parameter) !== 'object') id_parameter = JSON.parse(id_parameter);

                    if (Array.isArray(id_parameter) && id_parameter.length > 0) {
                      const parameters = querystring.parse(urlobj.query);

                      const new_parameters = {};

                      for (let x = 0; x < id_parameter.length; x++) {
                        const param_name = id_parameter[x];

                        if (x === 0 && param_name === '#') break;

                        if (parameters.hasOwnProperty(param_name)) new_parameters[param_name] = parameters[param_name];
                      }

                      urlobj.search = querystring.stringify(new_parameters);
                      final_link = urlUtil.format(urlobj);
                    }
                  }
                  return water_cb(null, final_link);
                } catch (err) {
                  return water_cb(err);
                }
              },
              async (final_link, water_cb) => {
                try {
                  if (final_link !== link) this.logger.debug(`Transform: ${link} -> ${final_link}`);

                  const urlhash = crypto.createHash('md5').update(`${final_link}`).digest('hex');

                  const value = await urlInfoDb.hgetall(urlhash);

                  return water_cb(null, final_link, urlhash, value);
                } catch (err) {
                  return water_cb(err);
                }
              },
              async (final_link, urlhash, values, water_cb) => {
                try {
                  let validate = true;

                  if (values && !Util.isEmpty(values)) {
                    const status = values['status'];
                    const last = parseInt(values['last']);
                    const t_version = parseInt(values['version']);
                    const type = values['type'];

                    if (status !== 'crawled_failure') {
                      let real_interval = t_driller_rules['schedule_interval'] * 1000;

                      if (status === 'crawling' || status === 'schedule') {
                        real_interval = 10 * 60 * 1000;
                      }

                      if (status === 'hit') {
                        real_interval = 2 * 24 * 60 * 60 * 1000;
                      }

                      if (status === 'crawled_finish' && type === 'branch' && version > last) {
                        real_interval = 0;
                        this.logger.debug(`${final_link} got new version after last crawling`);
                      }

                      if ((new Date()).getTime() - last < real_interval) {
                        this.logger.debug(util.format('ignore %s, last event time:%s, status:%s', final_link, last, status));
                        validate = false;
                      } else {
                        this.logger.debug(`${final_link} should insert into urlqueue`);
                      }
                    }

                    this.logger.debug(`url info exists, ${link}, just update the version`);

                    const ctc = {};
                    if (validate) ctc['status'] = 'hit';

                    if (version > t_version || isNaN(t_version)) {
                      ctc['version'] = version;
                      this.logger.debug(`update url(${final_link}) version, ${t_version} -> ${version}`);
                    } else {
                      this.logger.debug(`${final_link} keep the version: ${values['version']}`);
                    }

                    if (!Util.isEmpty(ctc)) {
                      await urlInfoDb.hmset(urlhash, ctc);

                      return water_cb(null, final_link, validate);
                    }
                    return water_cb(null, final_link, validate);
                  }
                  const vv = {
                    url: link,
                    version,
                    trace: alias,
                    referer: page_url,
                    create: (new Date()).getTime(),
                    records: JSON.stringify([]),
                    last: (new Date()).getTime(),
                    status: 'hit'
                  };

                  if (spiderCore.settings['keep_link_relation']) {
                    vv['drill_relation'] = drill_relation || '*';
                  }

                  await urlInfoDb.hmset(urlhash, vv);

                  return water_cb(null, final_link, true);
                } catch (err) {
                  return water_cb(err);
                }
              },
              async (final_link, validate, water_cb) => {
                try {
                  if (validate) {
                    const value = await drillerInfoDb.rpush(alias, final_link);
                    this.logger.debug(`push url: ${link} to urllib: ${alias}`);
                    return water_cb(null, value);
                  }
                  return water_cb(null, 'done');
                } catch (err) {
                  return water_cb(err);
                }
              }
            ],
            (err) => {
              sindex++;
              return sub_cb(err);
            }
            );
          },
          (err) => {
            index++;
            return cb(err);
          }
        );
      },
      (err) => {
        if (err) {
          this.logger.error('pipeline.save_link.asyncwhilst.err =', err);
          return reject(err);
        }
        this.logger.info(`save ${linkCount} links from ${page_url} to redis`);
        return resolve(true);
      }
    );
  });

  save_content = async (pageurl, content, extracted_data, js_result, referer, urllib, drill_relation) => {
    this.logger.debug('pipeline.save_content----->pageurl=====', pageurl);
    this.logger.debug('pipeline.save_content----->extracted_data=====', extracted_data);
    return true;
  }
}