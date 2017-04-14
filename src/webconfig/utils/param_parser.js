export default new class {
  json = (req, res, next) => {
    try {
      const params = this.parseParams(req, req.method);
      req.params = params;
      return next();
    } catch (err) {
      req.params = {};
      logger.error({ err }, 'parse_params.error');
      return next();
    }
  }

  parseParams = (req, method) => {
    const params = {};
    for (const key of Object.keys(req.params)) {
      params[key] = req.params[key];
    }
    if (method === 'GET') {
      for (const key of Object.keys(req.query)) {
        params[key] = req.query[key];
      }
    } else if (method === 'POST' || method === 'PUT') {
      for (const key of Object.keys(req.body)) {
        params[key] = req.body[key];
      }
      if (req.query) {
        for (const key of Object.keys(req.query)) {
          params[key] = req.query[key];
        }
      }
    }
    return params;
  }
};
