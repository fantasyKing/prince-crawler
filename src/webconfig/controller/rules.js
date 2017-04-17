import Redis from './../../lib/redis';

const TEMPLATE = {
  domain: '',
  url_pattern: '',
  alias: 'category',
  id_parameter: [
    '#'
  ],
  encoding: 'auto',
  type: 'branch',
  save_page: false,
  format: 'html',
  jshandle: false,
  extract_rule: {
    category: 'crawled',
    rule: {}
  },
  cookie: [],
  inject_jquery: false,
  load_img: false,
  drill_rules: [
    'a'
  ],
  drill_relation: {
    base: 'content',
    mode: 'css',
    expression: 'title',
    pick: 'text',
    index: 1
  },
  validation_keywords: [
    '当前位置'
  ],
  script: [],
  navigate_rule: [],
  stoppage: -1,
  priority: 2,
  weight: 10,
  schedule_interval: 86400,
  active: true,
  seed: [
    'http://www.sovxin.com/fenlei_zixun.html'
  ],
  schedule_rule: 'FIFO',
  use_proxy: false,
  first_schedule: 1414938594585
};

const UPDATEDDRILlERRUlER = 'updated:driller:rule';

export default new class {
  constructor() {
    this.drillerInfoDb = Redis.getClient('drillerInfoDb');
  }

  async list() {
    const keys = await this.drillerInfoDb.hlist('driller*');
    const rules = [];
    for (const key of keys) {
      const rule = await this.drillerInfoDb.hgetall(key);
      rule['id'] = key;
      rules.push(rule);
    }
    const thead = ['id', 'alias', 'schedule_rule', 'encoding', 'active', 'validation_keywords', 'actions'];
    const tbody = rules;
    return { thead, tbody };
  }

  async deleteRule(params) {
    const { id } = params;
    const result = await this.drillerInfoDb.hclear(id);
    if (result !== 0) {
      return true;
    }
    return false;
  }

  async editRule(params) {
    const { id } = params;
    if (id) {
      const result = await this.drillerInfoDb.hgetall(id);
      logger.debug('controller.editRule.result--->', result);
      const dataobj = TEMPLATE;
      const numberPattern = new RegExp('^-?[0-9]+$');
      for (const i of Object.keys(result)) {
        if (result.hasOwnProperty(i)) {
          if (typeof(result[i]) === 'string' && (result[i].charAt(0) === '{' || result[i].charAt(0) === '[')) {
            dataobj[i] = JSON.parse(result[i]);
          } else if (numberPattern.test(result[i])) {
            dataobj[i] = parseInt(result[i]);
          } else if (result[i] === 'true') {
            dataobj[i] = true;
          } else if (result[i] === 'false') {
            dataobj[i] = false;
          } else {
            dataobj[i] = result[i];
          }
        }
      }
      return dataobj;
    }
    return TEMPLATE;
  }

  async upsertRule(params) {
    let { jsondata } = params;
    jsondata = JSON.parse(jsondata);
    const { domain, alias } = jsondata;
    logger.debug('controller.rules.upsertRule.jsondata--->', jsondata);
    if (!domain || !alias) {
      throw new Error('missing domain or alias');
    }

    const dataobj = {};
    for (const i of Object.keys(jsondata)) {
      if (jsondata.hasOwnProperty(i)) {
        if (typeof(jsondata[i]) === 'object') {
          dataobj[i] = JSON.stringify(jsondata[i]);
        } else {
          dataobj[i] = jsondata[i];
        }
      }
    }
    logger.debug('controller.rules.upsertRule.brfore.jsondata--->', dataobj);
    await this.drillerInfoDb.hmset(`driller:${domain}:${alias}`, dataobj);
    await this.drillerInfoDb.set(UPDATEDDRILlERRUlER, new Date().getTime());
    return true;
  }
};
