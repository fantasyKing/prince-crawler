import express from 'express';

import paramsParser from './param_parser';

function handler(route) {
  return (req, res, next) => {
    try {
      const params = Object.assign({}, req.params);
      return route[3](req, res, params);
    } catch (err) {
      logger.error('router handler error', err);
      return res.json({ code: 0, message: 'request fail' });
    }
  };
}
/**
routes = {
  passport: [
    [method, route, [middlewares], handler]
  ]
}
 */
export default function (router, routes) {
  for (const key of Object.keys(routes)) {
    const elements = routes[key];
    const subRouter = express.Router();
    for (const element of elements) {
      const method = element[0].toLowerCase();
      subRouter[method](`${element[1]}`, element[2], paramsParser.json, handler(element));
      router.use(`/${key}`, subRouter);
    }
  }
}
