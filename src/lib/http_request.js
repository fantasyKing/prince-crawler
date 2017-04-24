import request from 'request';

export default new class {
  get = (options) => new Promise((resolve, reject) => {
    options = options || {};
    options.method = 'GET';
    request(options, (err, res, body) => {
      if (err) {
        return reject(err);
      }
      return resolve({ res, body });
    });
  });
};
