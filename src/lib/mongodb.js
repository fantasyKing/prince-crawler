import MongoClient from 'mongodb';

export default class Mongodb {
  constructor() {
    this.collections = {};
  }
  connect = async (url, options) => {
    options = options || {};
    const db = await MongoClient.connect(url, options);
    this.db = db;
    if (options.auth) {
      const { user, pass } = options.auth;

      if (user && pass) {
        const authResult = await db.authenticate(user, pass);
        if (!authResult) {
          throw new Error('mongo auth err');
        }
      }
    }
    return this;
  }

  getCollection = async (name) => {
    if (this.collections[name]) {
      return this.collections[name];
    }
    const db = this.db;
    let collection = await db.collection(name);
    if (!collection) {
      collection = await db.createCollection(name);
    }

    this.collections[name] = collection;
    return collection;
  }
}
