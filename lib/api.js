//
//
//

// General-purpose API for glueing everything together.

var URL = require('url');
var QS = require('querystring');
var defer = require('when').defer;
var Connection = require('./connection').Connection;
var clone = require('util')._extend.bind(null, {});

// Parse a URL to get the options used in the opening protocol
function openOptionsFromURL(parts) {
  var user = 'guest', passwd = 'guest';
  if (parts.auth) {
    auth = parts.auth.split(':');
    user = auth[0];
    passwd = auth[1];
  }

  var vhost = parts.pathname;
  if (!vhost)
    vhost = '/';
  else
    vhost = QS.unescape(vhost.substr(1));

  var q = parts.query || {};

  function intOrDefault(val, def) {
    return (val === undefined) ? def : parseInt(val);
  }

  return {
    // start-ok
    'clientProperties': {},
    'mechanism': 'PLAIN',
    'response': new Buffer(['', user, passwd].join(String.fromCharCode(0))),
    'locale': q.locale || 'en_US',

    // tune-ok
    'channelMax': intOrDefault(q.channelMax, 0),
    'frameMax': intOrDefault(q.frameMax, 0x1000),
    'heartbeat': intOrDefault(q.heartbeat, 0),

    // open
    'virtualHost': vhost,
    'capabilities': '',
    'insist': 0
  };
}

function connect(url, socketOptions) {
  // tls.connect uses `util._extend()` on the options given it, which
  // copies only properties mentioned in `Object.keys()`, when
  // processing the options. So I have to makes copies too, rather
  // than using `Object.create()`.
  var sockopts = clone(socketOptions || {});
  url = url || 'amqp://localhost';

  var parts = URL.parse(url, true); // yes, parse the query string
  var protocol = parts.protocol;
  var net;

  var options = openOptionsFromURL(parts);
  var port = parts.port || ((protocol === 'amqp:') ? 5672 : 5671);
  sockopts.host = parts.hostname;
  sockopts.port = parseInt(port);

  var result = defer();

  var sockok = false;
  var sock;

  function onConnect() {
    sockok = true;
    var c = new Connection(sock);
    c.open(options).then(function (_openok) { result.resolve(c); },
                         function(err) { result.reject(err); });
  }

  if (protocol === 'amqp:') {
    sock = require('net').connect(sockopts, onConnect);
  }
  else if (protocol === 'amqps:') {
    sock = require('tls').connect(sockopts, onConnect);
  }
  else {
    throw new Error("Expected amqp: or amqps: as the protocol; got " + protocol);
  }

  sock.once('error', function(err) {
    if (!sockok) result.reject(err);
  });

  return result.promise;
}

module.exports.connect = connect;
