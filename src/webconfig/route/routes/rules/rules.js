import Base from './../base';
import ruleCtrl from './../../../controller/rules';

export default new class extends Base {
  list = async (req, res, params) => {
    try {
      const result = await ruleCtrl.list(params);
      logger.debug('thead---->', result.thead);
      logger.debug('tbody---->', result.tbody);
      return this.ok(res, 'rules/list', { panel_header: 'Rules Actions', result });
    } catch (err) {
      logger.error('rules.list.error =>', err);
      return this.fail(res)(err);
    }
  }
};
