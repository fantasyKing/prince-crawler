import crypto from 'crypto';
import url from 'url';
import util from 'util';
import async from 'async';

import RedisClient from './../lib/redis_client_init';
import Redis from './../lib/redis';
import Util from './../lib/util';

export default class Spider {
  constructor(spiderCore) {
    this.spiderCore = spiderCore;
    this.queue_length = 0;
    this.driller_rules_updated = 0;
    this.driller_rules = {};
    this.logger = spiderCore.settings.logger;
  }

  assembly = async () => {
    await RedisClient.init(this.settings);
    this.drillerInfoDb = Redis.getClient('drillerInfoDb');
    this.urlInfoDb = Redis.getClient('urlInfoDb');
    this.urlReportDb = Redis.getClient('urlReportDb');
  }

  /**
   * smart parse string to json object deeply(level2)
   * @param source
   */
  jsonSmartDeepParse = (obj) => {
    const dataobj = {};
    const numberPattern = new RegExp('^-?[0-9]+$');

    for (const key of Object.keys(obj)) {
      if (typeof(obj[key]) === 'string' && (obj[key].charAt(0) === '{' || obj[key].charAt(0) === '[')) {
        dataobj[key] = JSON.parse(obj[key]);
      } else if (numberPattern.test(obj[key])) {
        dataobj[key] = parseInt(obj[key]);
      } else if (obj[key] === 'true') {
        dataobj[key] = true;
      } else if (obj[key] === 'true') {
        dataobj[key] = true;
      } else if (obj[key] === 'false') {
        dataobj[key] = false;
      } else {
        dataobj[key] = obj[key];
      }
    }
    return dataobj;
  }

  /**
   * refresh the driller rules
   */
  refreshDrillerRules = async () => {
    const self = this;
    const drillerInfoDb = this.drillerInfoDb;

    const value = await drillerInfoDb.get('updated:driller:rule');

    if (self.driller_rules_updated !== parseInt(value)) {
      this.logger.info('driller rules is changed');

      const rules = await drillerInfoDb.hlist('driller:*');

      self.tmp_driller_rules = {};
      self.tmp_driller_rules_length = rules.length;

      for (let i = 0; i < rules.length; i++) {
        self.wrapper_rules(rules[i]);
      }
      self.driller_rules_updated = parseInt(value);
    } else {
      this.logger.debug(`driller rules is not changed, queue length: ${self.queue_length}`);
      setTimeout(() => {
        self.refreshDrillerRules();
      }, self.spiderCore.settings['check_driller_rules_interval'] * 1000);
    }
  }

  wrapper_rules = async (key) => {
    const self = this;
    const drillerInfoDb = this.drillerInfoDb;

    const rule = await drillerInfoDb.hgetall(key);

    if (self.tmp_driller_rules === undefined) {
      self.tmp_driller_rules = {};
    }
    const isActive = rule['active'] === 'true' || rule['active'] === true || rule['active'] === '1' || rule['active'] === 1;

    if (isActive || self.spiderCore.settings['test']) {
      this.logger.info(`Load rule: ${key}`);
      if (self.tmp_driller_rules[rule['domain']] === undefined) {
        self.tmp_driller_rules[rule['domain']] = {};
      }
      self.tmp_driller_rules[rule['domain']][rule['alias']] = self.jsonSmartDeepParse(rule);
    } else {
      this.logger.debug(`Ignore rule: ${key}, status inactive`);
    }
    self.tmp_driller_rules_length--;

    if (self.tmp_driller_rules_length <= 0) {
      self.driller_rules = self.tmp_driller_rules;

      self.spiderCore.emit('driller_rules_loaded', self.driller_rules);

      setTimeout(() => {
        self.refreshDrillerRules();
      }, self.spiderCore.settings['check_driller_rules_interval'] * 1000);
    }
  }

  getDrillerRule = async (id, name) => {
    const splited_id = id.split(':');

    let pos = 1;
    if (splited_id[0] === 'urllib') pos = 2;

    if (this.driller_rules[splited_id[pos]][splited_id[pos + 1]] && this.driller_rules[splited_id[pos]][splited_id[pos + 1]].hasOwnProperty(name)) {
      return this.driller_rules[splited_id[pos]][splited_id[pos + 1]][name];
    }
    this.logger.warn(util.format('%s in %s %s, not found', name, splited_id[pos], splited_id[pos + 1]));
    return false;
  }

  getDrillerRules = async (id) => {
    const splited_id = id.split(':');
    let pos = 1;

    if (splited_id[0] === 'urllib') pos = 2;

    if (this.driller_rules[splited_id[pos]] && this.driller_rules[splited_id[pos]][splited_id[pos + 1]]) {
      return this.driller_rules[splited_id[pos]][splited_id[pos + 1]];
    }

    this.logger.warn(util.format('%s%s, not exists', splited_id[pos], splited_id[pos + 1]));
    return null;
  }

  getUrlQueue = async () => {
    const spider = this;

    const drillerInfoDb = this.drillerInfoDb;
    const urlInfoDb = this.urlInfoDb;

    const link = await drillerInfoDb.lpop('queue:scheduled:all');

    if (!link) {
      this.logger.info(`No candidate queue, ${spider.queue_length} urls in crawling.`);
      if ('no_queue_alert' in spider.spiderCore.spider_extend) spider.spiderCore.spider_extend.no_queue_alert();
      return false;
    }

    const linkhash = crypto.createHash('md5').update(link).digest('hex');

    const link_info = await urlInfoDb.hgetall(linkhash);

    if (!link_info || Util.isEmpty(link_info)) {
      this.logger.warn(`${link} has no url info, ${linkhash}, we try to match it`);
      const urlinfo = await spider.wrapLink(link);

      if (urlinfo !== null) {
        spider.spiderCore.emit('new_url_queue', urlinfo);
        return true;
      }
      this.logger.error(`${link} can not match any driller rule, ignore it.`);
      return await spider.getUrlQueue();
    }
    if (!link_info['trace']) {
      this.logger.warn(`${link}, url info is incomplete`);
      return await spider.getUrlQueue();
    }
    const drillerinfo = await spider.getDrillerRules(link_info['trace']);

    if (drillerinfo === null) {
      await urlInfoDb.del(linkhash);
      this.logger.warn(`${link}, has dirty driller info! clean it`);
      const urlinfo = await spider.wrapLink(link);
      if (urlinfo !== null) {
        spider.spiderCore.emit('new_url_queue', urlinfo);
      } else {
        this.logger.error(`Cleaned dirty driller info for ${link}, but can not match any driller rule right now, ignore it.`);
        return await spider.getUrlQueue();
      }
    }
    const urlinfo = {
      url: link,
      version: parseInt(link_info['version']),
      type: drillerinfo['type'],
      format: drillerinfo['format'],
      encoding: drillerinfo['encoding'],
      referer: link_info['referer'],
      url_pattern: drillerinfo['url_pattern'],
      urllib: link_info['trace'],
      save_page: drillerinfo['save_page'],
      cookie: drillerinfo['cookie'],
      jshandle: drillerinfo['jshandle'],
      inject_jquery: drillerinfo['inject_jquery'],
      drill_rules: drillerinfo['drill_rules'],
      drill_relation: link_info['drill_relation'],
      validation_keywords: drillerinfo['validation_keywords'] && drillerinfo['validation_keywords'] !== 'undefined' ? drillerinfo['validation_keywords'] : '',
      script: drillerinfo['script'],
      navigate_rule: drillerinfo['navigate_rule'],
      stoppage: drillerinfo['stoppage'],
      start_time: (new Date()).getTime()
    };
    this.logger.info(`new url: '+${link}`);
    spider.spiderCore.emit('new_url_queue', urlinfo);
    return true;
  }

  checkQueue = async (spider) => {
    let breakTt = false;

    async.whilst(
      () => {
        this.logger.debug(`Check queue, length: ${spider.queue_length}`);
        return spider.queue_length < spider.spiderCore.settings['spider_concurrency'] && breakTt !== true;
      },
      async (cb) => {
        const bol = await spider.getUrlQueue();
        if (bol === true) {
          spider.queue_length++;
        } else {
          breakTt = true;
        }
        cb();
      },
      (err) => {
        if (err) logger.error('Exception in check queue.');
      }
    );
  }

/**
 * TOP Domain,e.g: www.baidu.com  -> baidu.com
 * @param domain
 * @returns {*}
 * @private
 */
  __getTopLevelDomain = (domain) => {
    const arr = domain.split('.');
    if (arr.length <= 2) return domain;
    return arr.slice(1).join('.');
  }

/**
 * detect link which driller rule matched
 * @param link
 * @returns {string}
 */
  detectLink = async (link) => {
    const urlobj = url.parse(link);
    let result = '';
    const domain = this.__getTopLevelDomain(urlobj['hostname']);

    if (this.driller_rules[domain] !== undefined) {
      const alias = this.driller_rules[domain];

      const domain_rules = Object.keys(alias).sort((a, b) => alias[b]['url_pattern'].length - alias[a]['url_pattern'].length);

      for (let i = 0; i < domain_rules.length; i++) {
        const current_rule = domain_rules[i];
        const url_pattern = alias[current_rule]['url_pattern'];
        const patt = new RegExp(url_pattern);
        if (patt.test(link)) {
          result = `driller:${domain}:${current_rule}`;
          break;
        }
      }
    }

    return result;
  }

/**
 * construct a url info
 * @param link
 * @returns {*}
 */
  wrapLink = async (link) => {
    let linkinfo = null;
    const driller = await this.detectLink(link);

    if (driller !== '') {
      const driller_arr = driller.split(':');
      const drillerinfo = this.driller_rules[driller_arr[1]][driller_arr[2]];

      linkinfo = {
        url: link,
        version: (new Date()).getTime(),
        type: drillerinfo['type'],
        format: drillerinfo['format'],
        encoding: drillerinfo['encoding'],
        referer: '',
        url_pattern: drillerinfo['url_pattern'],
        urllib: `urllib:${driller}`,
        save_page: drillerinfo['save_page'],
        cookie: drillerinfo['cookie'],
        jshandle: drillerinfo['jshandle'],
        inject_jquery: drillerinfo['inject_jquery'],
        drill_rules: drillerinfo['drill_rules'],
        drill_relation: '*',
        validation_keywords: drillerinfo['validation_keywords'] && drillerinfo['validation_keywords'] !== 'undefined' ? drillerinfo['validation_keywords'] : '',
        script: drillerinfo['script'],
        navigate_rule: drillerinfo['navigate_rule'],
        stoppage: drillerinfo['stoppage']
      };
    }

    return linkinfo;
  }

/**
 * check retry
 * @param urlinfo
 */
  retryCrawl = async (urlinfo) => {
    const spider = this;
    let retryLimit = 3;
    const urlReportDb = this.urlReportDb;

    if (spider.spiderCore.settings['download_retry'] && spider.spiderCore.settings['download_retry'] !== undefined){
      retryLimit = spider.spiderCore.settings['download_retry'];
    }

    let act_retry = 0;
    if (urlinfo['retry']) act_retry = urlinfo['retry'];

    if (act_retry < retryLimit) {
      urlinfo['retry'] = act_retry + 1;
      this.logger.info(util.format('Retry url: %s, time: ', urlinfo['url'], urlinfo['retry']));
      spider.spiderCore.emit('new_url_queue', urlinfo);

      if ('crawl_retry_alert' in spider.spiderCore.spider_extend) {
        spider.spiderCore.spider_extend.crawl_retry_alert(urlinfo); // report
      }
    } else {
      await spider.updateLinkState(urlinfo['url'], 'crawled_failure');

      this.logger.error(util.format('after %s reties, give up crawl %s', urlinfo['retry'], urlinfo['url']));

      await urlReportDb.zadd(`fail:+${urlinfo['urllib']}`, urlinfo['version'], urlinfo['url']);
      spider.spiderCore.emit('slide_queue');

      if ('crawl_fail_alert' in spider.spiderCore.spider_extend) spider.spiderCore.spider_extend.crawl_fail_alert(urlinfo); // report
    }
  }

  /**
   * update link state to redis db
   * @param link
   * @param state
   */
  updateLinkState = async (link, state) => {
    try {
      const spider = this;
      const urlhash = crypto.createHash('md5').update(String(link)).digest('hex');

      const urlInfoDb = this.urlInfoDb;

      const link_info = await urlInfoDb.hgetall(urlhash);

      if (link_info && !Util.isEmpty(link_info)) {
        const t_record = link_info['records'];
        let records = [];

        if (t_record !== '' && t_record !== '[]') {
          try {
            records = JSON.parse(t_record);
          } catch (e) {
            this.logger.error(`${t_record} JSON parse error: `, e);
          }
        }

        records.push(state);

        await urlInfoDb.hmset(urlhash, {
          records: JSON.stringify(records.length > 3 ? records.slice(-3) : records),
          last: (new Date()).getTime(),
          status: state
        });

        if (state === 'crawled_finish') {
          await urlInfoDb.zrem(`fail:+${link_info['trace']}`, link);
        }
      } else {
        let trace = await spider.detectLink(link);

        if (trace !== '') {
          trace = `urllib:${trace}`;

          const urlinfo = {
            url: link,
            trace,
            referer: '',
            create: (new Date()).getTime(),
            records: JSON.stringify([]),
            last: (new Date()).getTime(),
            state
          };

          await urlInfoDb.hmset(urlhash, urlinfo);

          await urlInfoDb.zrem(`fail:${urlinfo['trace']}`, link);
        }
      }
    } catch (err) {
      this.logger.error(`get state of link(${link}) fail: `, err);
    }
  }
}
