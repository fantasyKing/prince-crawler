export default class {
  ok = (res, data, wrap) => {
    if (wrap) {
      return res.json({
        code: '1',
        result: {
          data
        }
      });
    }
    return res.json({
      code: '1',
      result: data
    });
  };

  fail = (res) => {
    const result = (e) => res.json({
      code: e.message || 'express-prince undifined err message'
    });
    return result;
  }
}
