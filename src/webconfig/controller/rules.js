import Redis from './../../lib/redis';

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
    const result = await this.drillerInfoDb.hgetall(id);
    logger.debug('rules.editRule.result--->', result);
    return result;
  }
};
