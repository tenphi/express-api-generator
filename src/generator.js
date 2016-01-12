let Promise = require('bluebird');
let _ = require('lodash');

function getPathByName(ctrlName) {
  return _.snakeCase(ctrlName.replace(/Ctrl$/, '').replace(/Controller$/, ''));
}

function getParamNames(fn) {
  var funStr = fn.toString();
  return funStr.slice(funStr.indexOf('(') + 1, funStr.indexOf(')')).match(/([^\s,]+)/g);
}

let moduleName = 'express-api-generator';

let log = {
  info: (...args) => console.log(moduleName + ':', ...args),
  warn: (...args) => console.warn(moduleName + ':', ...args),
  error: (...args) => {
    console.error(moduleName + ':', ...args);
    return moduleName + ': ' + args.map( arg => JSON.stringify(arg) ).join(', ');
  },
  debug: (...args) => console.log(moduleName + ':', ...args)
};

let replaceMap = {
  getAll: 'get',
  get: 'get',
  find: 'search',
  create: 'post',
  delete: 'delete',
  update: 'put'
};

let prefixMap = {
  set: 'put',
  activate: 'put',
  deactivate: 'put',
  delete: 'delete'
};

function getMethodAndPath(name) {
  let path, method, prefixes;

  prefixes = Object.keys(replaceMap);

  for (let prefix of prefixes) {
    if (name === prefix) {
      path = '';
      method = replaceMap[prefix];
    } else if (name.startsWith(prefix)) {
      path = '/' + _.snakeCase(name.replace(prefix, ''));
      method = replaceMap[prefix];
    } else {
      continue;
    }

    return [path, method];
  }

  prefixes = Object.keys(prefixMap);

  for (let prefix of prefixes) {
    if (name.startsWith(prefix)) {
      path = '/' + _.snakeCase(name);
      method = prefixMap[prefix];
      return [path, method];
    }
  }

  return ['/' + _.snakeCase(name), 'post'];
}

class Router {
  constructor(ctrls, defaults = {}) {
    this.defaults = {
      pathPrefix: '/api/',
      method: 'post'
    };
    this.routes = [];
    this.ctrls = ctrls || [];

    Object.assign(this.defaults, defaults);

    this._generateConfig();
  }

  bind(app) {
    this.routes.forEach( route => {
      if (!app[route.method]) {
        throw log.error('method not found', { method: route.method });
      }

      log.info('route', route.method + ':' + route.url, '->', route.controller.name + '.' + route.handler + '(' + route.args.join(',') + ')');

      app[route.method](route.url, (req, res) => {
        let ctrl = new route.controller(req, res);
        let args = this._collectArgs(req, route.method, args);

        Promise.resolve()
          .then( () => {
            return ctrl[route.handler](...args);
          })
          .catch( error => {
            if (error.stack) {
              res.statusCode(500);
              res.json({ error });
            } else {
              res.statusCode(400);
              res.json({ error });
            }
          })
          .then( answer => {
            res.json(answer);
          });
      });
    });
  }

  _generateConfig() {
    let { ctrls, routes, defaults } = this;

    for (let ctrl of ctrls) {
      let path = getPathByName(ctrl.name);

      if (typeof(ctrl) !== 'function') {
        throw log.error('controller is not a constructor', ctrl);
      }

      let proto = ctrl.prototype;
      let methods = Object.getOwnPropertyNames(proto);

      if (~methods.indexOf('constructor')) {
        methods.splice(methods.indexOf('constructor'), 1);
      }

      methods = methods.filter( method => method.charAt(0) !== '_' );

      if (!methods.length) {
        log.warn('controller doesn\'t have methods', ctrl);
        return;
      }

      methods.forEach( method => {
        let handler = proto[method];
        let route = {
          url: defaults.pathPrefix + path,
          args: getParamNames(handler) || [],
          controller: ctrl,
          handler: method
        };

        let [routePath, routeMethod] = getMethodAndPath(method);

        route.url += routePath;
        route.method = routeMethod;

        if (~route.args.indexOf('id')) {
          route.url += '/:id';
        }

        routes.push(route);
      });
    }
  }

  _collectArgs(req, method, args) {
    return args.map( name => {
      if (name === 'id') {
        return req.params.id;
      }

      if (method === 'get') {
        return req.query[name];
      } else {
        return req.body[name];
      }
    });
  }

  static setLogger(logger) {
    log = logger;
  }

  static setPromise(_Promise) {
    Promise = _Promise;
  }
}

export default Router;
