export default new class {
  home = async (req, res, params) => {
    return res.render('index', { err: { message: 'err test' } });
  }
};
