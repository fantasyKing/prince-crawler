import express from 'express';
import routes from './routes/';
import routerSetup from './../utils/router_setup';

const Router = express.Router();
routerSetup(Router, routes);

export {
  Router
};
