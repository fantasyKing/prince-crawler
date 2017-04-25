/**
 * Created on 5/11/16.
 */
import Redis from 'ioredis';

class redisClientExtend extends Redis {
  constructor(name, conf) {
    console.log('redis.conf------>', conf);
    super(conf.port, conf.host, { db: conf.db });
    this.name = name;
  }

  async hlist(name) {
    try {
      return await this.keys(name);
    } catch (err) {
      console.log('redis hlist error =', err);
      return [];
    }
  }

  async hclear(name) {
    try {
      return await this.del(name);
    } catch (err) {
      console.log('redis hclear error =', err);
      return 0;
    }
  }

  async zlen(name) {
    try {
      return await this.zcount(name, 0, (new Date()).getTime());
    } catch (err) {
      console.log('redis zlen error =', err);
      return 0;
    }
  }

  async zlist(name) {
    try {
      return await this.keys(name);
    } catch (err) {
      console.log('redis zlist error =', err);
      return [];
    }
  }

  async qlist(name) {
    try {
      return await this.keys(name);
    } catch (err) {
      console.log('redis qlist error =', err);
      return [];
    }
  }

  async close() {
    try {
      return await this.quit();
    } catch (err) {
      console.log('redis close error =', err);
      return 'FAIL';
    }
  }
}

const createClient = function createClient(name, conf) {
  return new Promise((resolve, reject) => {
    if (typeof conf !== 'object' || !conf) {
      return reject(new Error('Invalid redis config'));
    }
    const client = new redisClientExtend(name || 'default', conf);
    client.on('error', e => {
      console.error('redis', name, 'connect error ', e, e.stack);
      return reject(e);
    });
    client.on('ready', () => {
      console.log('redis', name, 'ready');
      return resolve(client);
    });
    client.on('connect', () => {
      console.log('redis', name, 'connect');
    });
    return client;
  });
};

export default new class {
  constructor() {
    this.redisClient = {};
  }

  createClient = async (name, host, port, db) => {
    if (this.redisClient[name]) {
      return this.redisClient[name];
    }
    const redisClient = await createClient(name, { host, port, db });
    this.redisClient[name] = redisClient;
    return redisClient;
  }

  close = async (name) => {
    if (this.redisClient[name]) {
      return await this.redisClient[name].close();
    }
    return 'OK';
  }

  getClient = (name) => {
    if (!this.redisClient[name]) {
      throw new Error(`${name} redisClient is not initialized`);
    }
    return this.redisClient[name];
  }
};
