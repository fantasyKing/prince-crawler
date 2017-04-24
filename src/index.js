import simpleLogger from 'simple-logger';
// import optimist from 'optimist';

import Scheduler from './scheduler/index';
import WebConfig from './webconfig/';

const userArgv = require('optimist')
.usage('Usage: $0 -i [instance name] -a [crawl|test|config|proxy|schedule]  -p [num] -l[url] -h')
.options('i', {
  alias: 'instance',
  default: 'example',
  describe: 'Specify a instance',
  demand: true
})
.options('a', {
  alias: 'action',
  default: 'crawl',
  describe: 'Specify a action[crawl|test|config|proxy|schedule]',
  demand: true
})
.options('p', {
  alias: 'port',
  default: 2013,
  describe: 'Specify a service port, for config service and proxy router'
})
.options('l', {
  alias: 'link',
  default: '',
  describe: 'Specify a url to test crawling'
})
.options('h', {
  alias: 'help',
  describe: 'Help infomation'
});

const options = userArgv.argv;
if (options['h']) {
  userArgv.showHelp();
  process.exit();
}

const settings = require(`./instance/${options['i']}/settings.json`);
settings['instance'] = options['i'];

let log_level = 'DEBUG';
if (settings['log_level']) log_level = settings['log_level'];

/**
 * start scheduler
 */
const schedule = function () {
  const logger = simpleLogger.getLogger(`schedule-${options['i']}`);
  logger.setLevel(log_level);
  settings['logger'] = logger;
  const scheduler = new Scheduler(settings);
  scheduler.start();
};

/**
 * start webconfig
 */
const configService = function () {
  const logger = simpleLogger.getLogger(`config-service-${options['i']}`);
  logger.setLevel(log_level);
  settings['logger'] = logger;
  settings['port'] = parseInt(options['p']);
  const webConfig = new WebConfig(settings);

  webConfig.start();
};

/**
 * test url
 */
const testUrl = function () {
  if (options['l'] !== '') {
    const logger = simpleLogger.getLogger(`test-${options['i']}`);
    logger.setLevel(log_level);
    settings['logger'] = logger;
    const spider = new (require('./spider'))(settings);

    spider.test(options['l']);
  }
};

switch (options['a']) {
  case 'config':
    configService();
    break;
  case 'schedule':
    schedule();
    break;
  case 'test':
    testUrl();
    break;
  default:
    userArgv.showHelp();
}

