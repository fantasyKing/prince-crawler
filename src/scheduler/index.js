import EventEmitter from 'events';
import util from 'util';
import async from 'async';

import RedisClient from './../lib/redis_client_init';
import Redis from './../lib/redis';

class Scheduler extends EventEmitter {
  constructor(settings) {
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
      priotity_list.sort((a, b) => b['rate'] - a['rate']);

      this.doSchedule();
    });

    this.assembly();
  }

  assembly = async () => {
    try {
      await RedisClient.init();
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
        const rules = drillerInfoDb.hlist('driller:*');
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
            scheduler.tmp_total_rates += rate;

            scheduler.tmp_priority_list.push({
              key,
              rate,
              rule: rule['schedule_rule'], // 'FIFO'
              interval: parseInt(rule['schedule_interval']), // 两次调度的时间间隔
              first_schedule: rule['first_schedule'] !== undefined ? parseInt(rule['first_schedule']) : 0,
              last_schedule: rule['last_schedule'] !== undefined ? parseInt(rule['last_schedule']) : 0,
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

      let balance = scheduler.settings['schedule_quantity_limitation'] - queue_length;
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
          // --check reschedule-------------
          if ((new Date()).getTime() - xdriller['first_schedule'] >= xdriller['interval'] * 1000) {
            scheduler.reSchedule(xdriller, index);
          }
          // -------------------------------
          const more = await scheduler.doScheduleExt(xdriller, avg_rate, left);
          left = more;
          cb();
        },
        (err) => {
          if (err) this.logger.error('schedule.doSchedule.async.whilst error =', err);
          this.logger.info(`schedule round finish, sleep ${scheduler.settings['schedule_interval']} s`);
          setTimeout(() => {
            scheduler.doSchedule();
          }, scheduler.settings['schedule_interval'] * 1000);
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
      this.logger.debug(`reschedule${driller['key']}`);

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

      this.priotity_list[index]['first_schedule'] = this.schedule_version;

      drillerInfoDb.hset(driller['key'], 'first_schedule', this.schedule_version);
      this.logger(`update first schedule time for ${driller['key']} successful`);
    } catch (err) {
      this.logger.error('schedule.reSchedule.error =', err);
    }
  }

  doScheduleExt = async () => {
    try {
      const scheduler = this;
      const drillerInfoDb = this.drillerInfoDb;


    } catch (err) {
      this.logger.error('schedule.doScheduleExt.error', err);
    }
  }
}

export default Scheduler;
