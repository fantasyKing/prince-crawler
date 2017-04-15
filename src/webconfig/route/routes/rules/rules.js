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

  deleteRule = async (req, res, params) => {
    try {
      await ruleCtrl.deleteRule(params);
      return this.redirect(res, 'back');
    } catch (err) {
      logger.error('rules.deleteRule.error =>', err);
      return this.fail(res)(err);
    }
  }

  editRule = async (req, res, params) => {
    try {
      const result = await ruleCtrl.editRule(params);
      return this.ok(res, 'rules/edit', { rule: result });
    } catch (err) {
      logger.error('rules.deleteRule.error =>', err);
      return this.fail(res)(err);
    }
  }
};
