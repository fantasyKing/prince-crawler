export default new class {
  arrayUnique(arr) {
    return arr.reduce((p, c) => {
      if (p.indexOf(c) < 0) p.push(c);
      return p;
    }, []);
  }

  arrayShuffle(arr) {
    for (let j, x, i = arr.length; i; j = parseInt(Math.random() * i), x = arr[--i], arr[i] = arr[j], arr[j] = x);
    return arr;
  }

  endsWith(str, suffix) {
    if (!str) {
      return false;
    }
    return str.indexOf(suffix, this.length - suffix.length) !== -1;
  }

  startsWith(str, suffix) {
    if (!str) {
      return false;
    }
    return str.indexOf(suffix, 0) === 0;
  }

  trim(str) {
    return str.replace(/(^\s*)|(\s*$)/g, '');
  }

  isEmpty(obj) {
    if (!obj) {
      return false;
    }
    return Object.keys(obj).length === 0;
  }

  clone(obj) {
    // Handle the 3 simple types, and null or undefined
    if (obj === null || typeof obj === 'object') return obj;

    // Handle Date
    if (obj instanceof Date) {
      const copy = new Date();
      copy.setTime(obj.getTime());
      return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
      const copy = [];
      for (let i = 0, len = obj.length; i < len; ++i) {
        copy[i] = this.clone(obj[i]);
      }
      return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
      const copy = {};
      for (const attr of Object.keys(obj)) {
        if (obj.hasOwnProperty(attr)) copy[attr] = this.clone(obj[attr]);
      }
      return copy;
    }

    throw new Error(`Unable to copy obj! Its type isn't supported.`);
  }

  format(date, fmt) {
    const o = {
      'M+': date.getMonth() + 1,
      'd+': date.getDate(),
      'h+': date.getHours(),
      'm+': date.getMinutes(),
      's+': date.getSeconds(),
      'q+': Math.floor((date.getMonth() + 3) / 3),
      S: date.getMilliseconds()
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (`${date.getFullYear()}`).substr(4 - RegExp.$1.length));
    for (const k in o) {
      if (new RegExp(`(${k})`).test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : ((`00${o[k]}`).substr((`${o[k]}`).length)));
    }
    return fmt;
  }
};
