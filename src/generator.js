let Promise = require('bluebird');

function getParamNames(fn) {
  var funStr = fn.toString();
  return funStr.slice(funStr.indexOf('(') + 1, funStr.indexOf(')')).match(/([^\s,]+)/g);
}

let log = {
  info: (...args) => console.log('tnp-router:', ...args),
  warn: (...args) => console.warn('tnp-router:', ...args),
  error: (...args) => {
    console.error('tnp-router:', ...args);
    return 'tnp-router: ' + args.map( arg => JSON.stringify(arg) ).join(', ');
  },
  debug: (...args) => console.log('tnp-router:', ...args)
};

let methodMap = {
  getAll: 'get',
  get: 'get',
  create: 'post',
  update: 'put',
  delete: 'delete'
};

class Router {
  constructor(ctrls, defaults = {}) {
    this.defaults = {
      pathPrefix: '/api/',
      method: 'post'
    };
    this.routes = [];
    this.ctrls = ctrls || {};

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
    let ctrlsNames = Object.keys(ctrls);

    ctrlsNames.forEach( path => {
      let ctrl = ctrls[path];

      path = path.replace(/\./g, '/');

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
          args: getParamNames(handler),
          controller: ctrl,
          handler: method
        };

        if (methodMap[method]) {
          route.method = methodMap[method];
        } else {
          route.method = 'post';
          route.url += '/' + method;
        }

        if (~route.args.indexOf('id')) {
          route.url += '/:id';
        }

        routes.push(route);
      });

    });
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
