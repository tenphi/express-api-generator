let Promise = require('bluebird');
let _ = require('lodash');

function getPathByName(ctrl) {
  return _.snakeCase(getControllerName(ctrl));
}

function haveId(name) {
  for (let prefix of idPrefixList) {
    if (name.startsWith(prefix) && name !== 'getAll') {
      return true;
    }
  }
}

function getControllerName(ctrl) {
  return ctrl.name.replace(/Ctrl$/, '').replace(/Controller$/, '');
}

function getControllerMethods(ctrl) {
  let proto = ctrl.prototype;
  let methods = [];

  do {
    methods.push(...Object.getOwnPropertyNames(proto));
  } while ((proto = proto.__proto__) && proto !== Object.prototype)

  methods = _.uniq(methods);
  _.pull(methods, ['init', 'constructor']);

  return methods;
}

let moduleName = 'express-apigen';

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
  delete: 'delete',
  add: 'post',
  remove: 'delete'
};

let idPrefixList = ['set', 'get', 'delete', 'update'];

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

    if (defaults.Logger) {
      log = new defaults.Logger(moduleName);
    }

    Object.assign(this.defaults, defaults);

    this._generateConfig();
  }

  bind(app) {
    this.routes.forEach( route => {
      if (!app[route.method]) {
        throw log.error('method not found', { method: route.method });
      }

      log.info('route', _.padRight(_.padLeft(route.method, 6, ' ') + ':' + route.url, 40, ' '), '->', getControllerName(route.ctrl) + '.' + route.handler + '(' + (route.id ? 'id, ' : '') + 'data)');

      app[route.method](route.url, async (req, res) => {
        let ctrl = new route.ctrl(req, res);
        let data = this._collectData(req, route.method);
        let args = [data];

        if (route.id) {
          args.unshift(req.params.id);
          ctrl._id = req.params.id;
        }

        ctrl._method = route.method;
        ctrl._data = data;

        if (ctrl.init) {
          await ctrl.init();
        }

        Promise.resolve()
          .then( () => ctrl.init ? ctrl.init() : undefined )
          .then( () => {
            return ctrl[route.handler](...args);
          })
          .catch( error => {
            if (error.stack) {
              //res.sendStatus(500);
              log.error(error.stack);
              res.json({ error: 'internal error' });
            } else {
              //res.sendStatus(400);
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
      if (!ctrl.name) {
        log.error('invalid controller', ctrl);
        continue;
      }

      let path = getPathByName(ctrl);

      if (typeof(ctrl) !== 'function') {
        throw log.error('controller is not a constructor', ctrl);
      }

      let proto = ctrl.prototype;
      let methods = getControllerMethods(ctrl);

      if (~methods.indexOf('constructor')) {
        methods.splice(methods.indexOf('constructor'), 1);
      }

      methods = methods.filter( method => method.charAt(0) !== '_' );

      if (!methods.length) {
        log.info('controller doesn\'t have methods', ctrl);
        continue;
      }

      let ctrlName = getControllerName(ctrl);

      methods.forEach( method => {
        let handler = proto[method];
        let route = {
          url: defaults.pathPrefix + path,
          id: haveId(method),
          ctrl: ctrl,
          ctrlName: ctrlName,
          handler: method
        };

        let [routePath, routeMethod] = getMethodAndPath(method);

        route.url += routePath;
        route.method = routeMethod;

        if (route.id) {
          route.url += '/:id';
        }

        routes.push(route);
      });
    }
  }

  _collectData(req, method) {
    return method === 'post' || method === 'update' ? req.body : req.query;
  }

  static setLogger(logger) {
    log = logger;
  }

  static setPromise(_Promise) {
    Promise = _Promise;
  }
}

export default Router;
