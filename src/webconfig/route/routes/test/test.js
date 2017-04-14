import testCtrl from './../../../controller/test';

export default new class {
  test = async (req, res, params) => {
    return res.render('test', { test: 'this is test' });
  }
};
