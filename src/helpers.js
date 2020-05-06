export const isEmpty = (val) => {
  if (val === undefined) {
    return true;
  }

  if (typeof (val) === 'function' || typeof (val) === 'number' || typeof (val) === 'boolean' || Object.prototype.toString.call(val) === '[object Date]') {
    return false;
  }

  if (val == null || val.length === 0) {
    return true;
  }

  if (typeof (val) === 'object') {
    let r = true;
    // eslint-disable-next-line
    for (const f in val) {
      r = false;
    }

    return r;
  }
  return false;
};

export const omit = (keys, obj) => {
  const cp = { ...obj };
  keys.forEach((key) => {
    delete cp[key];
  });
  return cp;
}

export const isPlainObject = (obj) => {
  let key;
  if (!obj || obj.nodeType) {
    return false;
  }
  if (obj.constructor) {
    return false;
  }
  // eslint-disable-next-line
  for (key in obj) {}
  return key === undefined;
};

export const isFalsey = (val) => {
  if (val === false) return true;
  if (val === undefined) return true;
  if (isEmpty(val)) return true;
  if (isPlainObject(val)) return true;
  return false;
};

export const printBlankLine = () => console.log();

export const extractQueueNameFromARN = (arn) => {
  const [, , , , , QueueName] = arn.split(':');
  return QueueName;
};
