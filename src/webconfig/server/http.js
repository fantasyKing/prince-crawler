import express from 'express';
import bodyParser from 'body-parser';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import serveFavicon from 'serve-favicon';
import serveStatic from 'serve-static';

class HTTP {
  constructor(opts) {
    if (!opts.port) {
      throw new Error('http `port` should not be null.');
    }
    this.port = opts.port;
    this.app = express();

    this.app.set('port', this.port);

    morgan.token('type', () => 'access-log');
    morgan.token('app', () => 'prince-crawler-webconfig');
    this.use(morgan('[:date[iso]] [:type] :app [:method] [:url] [:status] [:response-time]'));

    this.app.set('views', path.resolve(`${__dirname}./../views`));
    this.app.set('view engine', 'ejs');

    this.use(serveFavicon(path.resolve(`${__dirname}./../public/spider_favicon.gif`)));
    this.use(serveStatic(path.resolve(`${__dirname}./../public`)));

    this.use(cookieParser('1234567890QWERTY'));
    this.use(session({ secret: '1234567890QWERTY', cookie: { httpOnly: false } }));

    this.use(bodyParser.json({ limit: '64mb' }));
    this.use(bodyParser.urlencoded({ limit: '64mb', extended: true, parameterLimit: 1000000 }));
    this.use(compression());
  }

  errorLog = (e, req, res, next) => {
    console.error('express uncatch error =', e);
    next(e);
  };

  clientErrorHandler = (e, req, res, next) => {
    if (req.xhr) {
      return res.send({ code: 0, message: '请求异常' });
    }
    return next(e);
  };

  errorHandler = (e, req, res, next) => {
    res.statusCode = 500;
    res.send({ code: 500 });
  };

  notFoundHandler = (req, res) => {
    res.statusCode = 404;
    res.end();
  };

  use = (...args) => {
    this.app.use.apply(this.app, args);
  };

  start = () => {
    this.use(this.notFoundHandler);
    this.use(this.errorLog);
    this.use(this.clientErrorHandler);
    this.use(this.errorHandler);

    const server = this.app.listen(this.port, () => {
      console.log('http listen on', this.port);
      console.log('http run at env:', process.env.NODE_ENV);
    });
    process.on('SIGINT', () => {
      console.log('http exiting...');
      process.exit();
      server.close(() => {
        console.log('http exited.');
        process.exit(0);
      });
    });

    process.on('uncaughtException', err => {
      console.log('uncatchd exception =', err.message, err.stack);
      process.exit(0);
    });

    process.on('unhandledRejection', (reason, p) => {
      console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    });
  }
}

export default HTTP;
