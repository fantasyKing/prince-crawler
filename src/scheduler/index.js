import EventEmitter from 'events';
import util from 'util';
import async from 'async';
import urlUtil from 'url';
import querystring from 'querystring';
import crypto from 'crypto';

import RedisClient from './../lib/redis_client_init';
import Redis from './../lib/redis';
import Util from './../lib/util';

class Scheduler extends EventEmitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.logger = settings.logger;
    this.priotities_updated = 0;
    this.priotity_list = []; // [{"key":"...","rate":"...","rule":"...","interval":"...","first_schedule":"...","last_schedule":"...","seed":"..."}]
    this.max_weight = 100;
    this.total_rates = 0;
    this.driller_rules = {}; // {"domain":{"alias":{"rules":"..."}}}
    this.schedule_version = (new Date()).getTime();
  }

  start = async () => {
    this.on('priorities_loaded', (priotity_list) => {
      if (this.scheduleTimer) { // 清除旧的schedule timer
        clearTimeout(this.scheduleTimer);
      }

      priotity_list.sort((a, b) => b['rate'] - a['rate']);

      this.doSchedule();
    });

    this.assembly();
  }

  assembly = async () => {
    try {
      await RedisClient.init(this.settings);
      this.drillerInfoDb = Redis.getClient('drillerInfoDb');
      this.urlInfoDb = Redis.getClient('urlInfoDb');
      this.refreshPriotities();
    } catch (err) {
      this.logger.error('scheduler.assembly.error = ', err);
    }
  }

  refreshPriotities = async () => {
    try {
      const scheduler = this;

      const drillerInfoDb = this.drillerInfoDb;

      const drillerRuleUpdateTime = await drillerInfoDb.get('updated:driller:rule');

      if (this.priotities_updated !== parseInt(drillerRuleUpdateTime)) {
        this.logger.debug('driller rules is changed');
        const rules = await drillerInfoDb.hlist('driller:*');
        scheduler.tmp_driller_rules = {};
        scheduler.tmp_priority_list = []; // 优先级顺序
        scheduler.tmp_total_rates = 0;
        scheduler.tmp_priotites_length = rules.length;

        for (const key of rules) { // 有待优化
          const rule = await drillerInfoDb.hgetall(key);
          if (scheduler.tmp_priotities === undefined) {
            scheduler.tmp_priotities = { items: {}, nums: [] };
          }

          const isActive = Boolean(rule['active']);

          if (isActive) {
            this.logger.debug(`Load rule:${key}`);

            if (scheduler.tmp_driller_rules[rule['domain']] === undefined) {
              scheduler.tmp_driller_rules[rule['domain']] = {};
            }
            scheduler.tmp_driller_rules[rule['domain']][rule['alias']] = rule;

            const rate = (scheduler.max_weight + parseFloat(rule['weight'])) / parseFloat(rule['priority']);
            scheduler.tmp_total_rates += rate; // rate越大优先级越高

            scheduler.tmp_priority_list.push({
              key,
              rate,
              rule: rule['schedule_rule'], // 'FIFO'
              interval: parseInt(rule['schedule_interval']), // 两次调度的时间间隔
              first_schedule: rule['first_schedule'] || false,
              last_schedule: rule['last_schedule'] || false,
              seed: JSON.parse(rule['seed'])
            });
          } else {
            this.logger.debug(`Ignore rule: ${key}, status inactive`);
          }
        }

        scheduler.driller_rules = scheduler.tmp_driller_rules;
        scheduler.priotity_list = scheduler.tmp_priority_list;
        scheduler.total_rates = scheduler.tmp_total_rates;
        this.logger.debug('priorities loaded finish');

        scheduler.emit('priorities_loaded', scheduler.priotity_list);
        this.priotities_updated = parseInt(drillerRuleUpdateTime);
      } else {
        this.logger.debug('driller rules is not changed');
      }
      setTimeout(() => {
        scheduler.refreshPriotities();
      }, scheduler.settings['check_driller_rules_interval'] * 1000);
    } catch (err) {
      this.logger.error('schedule.refreshPriotities.error', err);
    }
  }

  doSchedule = async () => {
    try {
      const scheduler = this;

      scheduler.schedule_version = (new Date()).getTime();

      const drillerInfoDb = this.drillerInfoDb;

      const queue_length = await drillerInfoDb.llen('queue:scheduled:all');

      let balance = scheduler.settings['schedule_quantity_limitation'] - queue_length; // 调度器给爬虫的最大网址待抓取数量
      if (balance < 0) balance = 0;

      const avg_rate = balance / scheduler.total_rates;

      this.logger.info(util.format('Schedule, candidate queue length: %s, balance: %s, average length: %s', queue_length, balance, avg_rate));

      let index = -1;
      let left = 0;

      async.whilst(
        () => {
          index++;
          return index < scheduler.priotity_list.length;
        },
        async (cb) => {
          const xdriller = scheduler.priotity_list[index];
          // --check reschedule------------- // 应该改为如果urllib中都为空的话，执行reSchedule，然后可以去掉first_schedule字段,获取直接定义first_schedule为true, 执行过后改为false
          this.logger.debug('doSchedule.async.whilst.first_schedule--->', xdriller['first_schedule']);
          if (xdriller['first_schedule']) {
            await scheduler.reSchedule(xdriller, index);
          } else {
            const more = await scheduler.doScheduleExt(xdriller, avg_rate, left);
            left = more;
            this.logger.debug('doSchedule.after.doScheduleExt.left', left);
          }
          return cb();
          // -------------------------------
        },
        (err) => {
          if (err) this.logger.error('schedule.doSchedule.async.whilst error =', err);
          this.logger.info(`schedule round finish, sleep ${scheduler.settings['schedule_interval']} s`);
          const scheduleTimer = setTimeout(() => {
            scheduler.doSchedule();
          }, scheduler.settings['schedule_interval'] * 1000);
          this.scheduleTimer = scheduleTimer;
        }
      );
    } catch (err) {
      this.logger.error('schedule.schedule.error = ', err);
    }
  }

  reSchedule = async (driller, index) => {
    try {
      const scheduler = this;
      const drillerInfoDb = this.drillerInfoDb;
      this.logger.debug(`reschedule:${driller['key']}`);

      const links = [];

      for (let i = 0; i < driller['seed'].length; i++) {
        const link = driller['seed'][i];
        const link_arr = link.split('#');
        if (link_arr.length >= 5) {
          const min = parseInt(link_arr[2]);
          const max = parseInt(link_arr[3]);
          const scale = parseInt(link_arr[4]);
          for (let x = min; x <= max; x += scale) {
            links.push(link_arr[0] + x + link_arr[1]);
          }
        } else {
          links.push(link);
        }
      }

      for (const link of links) {
        const result = await scheduler.updateLinkState(link, 'schedule', scheduler.schedule_version); // 有待优化
        if (result) {
          await drillerInfoDb.rpush('queue:scheduled:all', link);
          this.logger.info('reschedule url: ', link);
        } else {
          this.logger.warn(util.format('reschedule(%s) failure, can not update link state', link));
        }
      }

      this.priotity_list[index]['first_schedule'] = false;

      drillerInfoDb.hset(driller['key'], 'first_schedule', false);
      this.logger.debug(`update first schedule time for ${driller['key']} successful`);
    } catch (err) {
      this.logger.error('schedule.reSchedule.error =', err);
    }
  }

  doScheduleExt = async (xdriller, avg_rate, more) => new Promise(async (resolve) => {
    const scheduler = this;
    const drillerInfoDb = this.drillerInfoDb;
    const queue_length = await drillerInfoDb.llen(`urllib:${xdriller['key']}`);

    const ct = Math.ceil(avg_rate * xdriller['rate']) + more;
    const act = queue_length >= ct ? ct : queue_length;
    this.logger.debug(util.format('%s, rate:%d, queue length:%d, actual quantity:%d', xdriller['key'], xdriller['rate'], queue_length, act));

    let count = 0;
    let pointer = true; // current point, false means end of list

    async.whilst(
      () => count < ct && pointer,
      async (cb) => {
        if (xdriller['rule'] === 'LIFO') {
          const url = await drillerInfoDb.rpop(`urllib:${xdriller['key']}`);
          pointer = url;
          this.logger.debug('doScheduleExt.before.checkURL.url', url, typeof url);
          if (!url || url === 'null') {
            this.logger.debug(`error or end of list, urllib:${xdriller['key']}`);
            return cb(new Error(`urllib:${xdriller['key']} is empty`));
          }
          this.logger.debug(`fetch url ${url} from urllib:${xdriller['key']}`);
          const bol = await scheduler.checkURL(url, xdriller['interval']);
          if (bol) count++;
          return cb();
        }
        const url = await drillerInfoDb.lpop(`urllib:${xdriller['key']}`);
        pointer = url;
        if (!url || url === 'null') {
          this.logger.debug(`error or end of list, urllib:${xdriller['key']}`);
          return cb(new Error(`urllib:${xdriller['key']} is empty`));
        }
        this.logger.debug(`fetch url ${url} from urllib:${xdriller['key']}`);
        const bol = await scheduler.checkURL(url, xdriller['interval']);
        if (bol) count++;
        return cb();
      },
      (err) => {
        if (err) {
          this.logger.error('schedule.doScheduleExt.whilst.error', err);
          // reject(err);
        }
        let left = 0;
        if (count < ct) left = ct - count;
        this.logger.debug(`Schedule ${xdriller['key']}, ${count}/${ct}, left ${left}`);
        resolve(left);
      }
    );
  });

  checkURL = async (url, interval) => {
    try {
      const scheduler = this;

      if (typeof(url) !== 'string') {
        this.logger.error(util.format('Invalidate url: %s', url));
        return false;
      }
      const drillerInfoDb = this.drillerInfoDb;
      const urlInfoDb = this.urlInfoDb;

      const kk = crypto.createHash('md5').update(url).digest('hex');

      const values = await urlInfoDb.hgetall(kk);

      if (!values || Util.isEmpty(values)) {
        this.logger.error(`${url} not exists in urlinfo'`);
        return false;
      }
      if (values['trace']) {
        const t_url = scheduler.transformLink(url, values['trace']);
        if (t_url !== url) {
          this.logger.debug(util.format('Transform url: %s -> %s', url, t_url));
          return await scheduler.checkURL(t_url, interval);
        }

        const traceArr = values['trace'].split(':');
        if (!scheduler.driller_rules[traceArr[2]] || !scheduler.driller_rules[traceArr[2]][traceArr[3]]) {
          this.logger.warn(`${url} driller info expired, update it`);

          const d_r = await scheduler.detectLink(url);

          if (d_r) {
            await urlInfoDb.hset(kk, 'trace', `urllib:${d_r}`);
            this.logger.debug(`${url} trace changed ${values['trace']} -> urllib:${d_r}`);
            return await scheduler.checkURL(url, interval);
          }
          this.logger.error(`no rule match ${url}`);
          return false;
        }
      }
      /**
       * 判断url是否可以重新进入抓取队列
       */
      const status = values['status'];
      // const records = values['records'] ? JSON.parse(values['records']) : [];
      const last = values['last'] ? parseInt(values['last']) : 0;
      const version = values['version'] ? parseInt(values['version']) : 0;
      const type = values['type'];

      if (status !== 'crawled_failure' && status !== 'hit') {
        let real_interval = interval * 1000;
        if (status === 'crawling' || status === 'schedule') {
          real_interval = 60 * 60 * 1000;
        }

        if (status === 'crawled_finish' && type === 'branch' && version > last) {
          real_interval = 0;
          this.logger.debug(`${url} got new version after last crawling`);
        }

        if ((new Date()).getTime() - last < real_interval) { // 一分钟内不再重复拉取同一个url
          this.logger.debug(util.format('ignore %s, last event time:%s, status:%s', url, last, status));
          return false;
        }
        this.logger.debug(`release lock: ${url}`);
      }

      const bol = await scheduler.updateLinkState(url, 'schedule', false);

      if (bol) {
        await drillerInfoDb.rpush('queue:scheduled:all', url);
        this.logger.info(`Append ${url} to queue successful`);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error('schedule.checkURL.error');
      return false;
    }
  }

  transformLink = async (link, urllib) => {
    let final_link = link;
    const urlobj = urlUtil.parse(link);
    const domain = this.__getTopLevelDomain(urlobj['hostname']);

    const drill_alias = urllib.slice(urllib.lastIndexOf(':') + 1);

    if (this.driller_rules[domain] && this.driller_rules[domain][drill_alias]) {
      let driller_rule = this.driller_rules[domain][drill_alias];

      if (typeof(driller_rule) !== 'object') driller_rule = JSON.parse(driller_rule);

      if (driller_rule['id_parameter']) {
        const id_parameter = JSON.parse(driller_rule['id_parameter']);

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
    }

    return final_link;
  }

  __getTopLevelDomain = (domain) => {
    const arr = domain.split('.');
    if (arr.length <= 2) return domain;
    return arr.slice(1).join('.');
  }

  detectLink = async (link) => {
    const urlobj = urlUtil.parse(link);
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

  updateLinkState = async (link, state, version) => {
    try {
      const scheduler = this;
      const urlhash = crypto.createHash('md5').update(`${link}`).digest('hex');

      const urlInfoDb = this.urlInfoDb;

      const link_info = await urlInfoDb.hgetall(urlhash);

      if (link_info && !Util.isEmpty(link_info)) {
        const t_record = link_info['records'];
        let records = [];

        if (t_record !== '' && t_record !== '[]') {
          try {
            records = JSON.parse(t_record);
          } catch (e) {
            this.logger.error(`${t_record} JSON parse error: ${e}`);
          }
        }
        records.push(state);
        const valueDict = {
          records: JSON.stringify(records.length > 3 ? records.slice(-3) : records),
          last: (new Date()).getTime(),
          status: state
        };

        if (version) {
          valueDict['version'] = version; // set version
        }
        await urlInfoDb.hmset(urlhash, valueDict);
        this.logger.debug(`update state of link(${link}) success: ${state}`);
        return true;
      }
      let trace = await scheduler.detectLink(link);

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

        if (version) urlinfo['version'] = version; // update version

        await urlInfoDb.hmset(urlhash, urlinfo);

        this.logger.debug(`save new url info: ${link}`);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error(`update state of link (${link}) fail: $${err}`);
      return false;
    }
  }
}

export default Scheduler;
