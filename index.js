var isString = require('lodash.isstring')
var extend = require('xtend')
var map = require('lodash.map')
var zip = require('lodash.zip')
var Type = require('transformer-type');
var Object = Type.Object;
var defer = require('./defer');

module.exports = Conversion

var conversion_defaults = {
  'type': 'conversion',
  // 'invertible': true,
  'input': [],
  'output': []
}

// A Conversion is one of the two Transformer objects.
// Conversions are functions that map from one set of Types to another.
// They "transform" source types into target types.

// Some Conversions are invertible -- meaning they are one-to-one and can be
// "undone" or reverted (e.g. email-ddress <---> mailto-url). This is only
// when there is no information loss.

// Other Conversions are lossy -- meaning reduce information, are one-way,
// and cannot be "undone" perfectly (e.g. us-street-address ---> us-zip-code).


// Implementation Details:
// new Conversion(...) returns a function that:
// - can be applied to a value
// - has information regarding the types it converts between


function Conversion(inType, outType, func, src) {

  // coercing call?
  if (arguments.length == 1 && inType instanceof Conversion)
      return src;

  // want to inherit prototype
  if (!(this instanceof Conversion))
    return new Conversion(inType, outType, func, src);

  // setup id if not given
  src = extend({}, src); // copy + default.
  src.id = Conversion.idWithTypes(inType, outType);

  // if it has been seen before, return that.
  if (src && Conversion.all[src])
    return Conversion.all[src];

  if (src && src.id && Conversion.all[src.id])
    return Conversion.all[src.id];

  // setup object src with defaults
  src = Object(src, conversion_defaults);

  // get type ids
  src.input = inType.src.id;
  src.output = outType.src.id;
  src.description = src.description || src.input +' to '+ src.output;
  if (src.async)
    src.async = true; // force boolean. default is async = false.

  // if we have a 'mapping' key (relation) attempt to create func.
  if (!func && src['mapping']) {
    func = Conversion.convertFromSchema(src);
  }

  if (!func)
    throw new Error('Conversion requires a function.');

  // label the function so it is printed meaningfully
  func.name = src.id;
  func.id = src.id;

  // return a different object, one that can be applied directly.
  var wrap = (src.async ? convertAsyncWrap : convertSyncWrap);
  var conv = wrap(func, outType);
  conv.name = src.id + '.wrapper';
  conv.type = Conversion;
  conv.convert = func;
  conv.src = src;
  conv.inType = inType;
  conv.outType = outType;
  conv.async = src.async;
  func.async = src.async;
  return conv;
}

Conversion.all = {};

function notImplemented() {
  throw new Error('Conversion not implemented.');
}

function uninvertible() {
  throw new Error('Uninvertible conversion inversion invoked.');
}

Conversion.idWithTypes = function(t1, t2) {
  if (t1.src && t1.src.id)
    t1 = t1.src.id

  if (t2.src && t2.src.id)
    t2 = t2.src.id

  if (!(isString(t1) && isString(t2)))
    throw new Error('type ids should be strings');

  return t1 + '-to-' + t2;
};

Conversion.convertFromSchema = function(src) {
  if (!src['mapping'])
    throw new Error('no mapping in conversion schema.');

  // here, we'll construct a conversion function (and inverse if possible)
  // from a schema specifying a relational mapping. For example:
  //
  //  {'mapping': {'key_in_output': 'key_in_input'}}
  //
  throw new Error('NOT YET IMPLEMENTED');
}


Conversion.Identity = function identityConversion(tFrom, tTo) {
  return new Conversion(tFrom, tTo, function(d) { return d; });
};

Conversion.pathIds = function conversionPathIds(types) {
  var pairs = zip(types.slice(0, types.length - 1), types.slice(1));
  return map(pairs, function(pair) {
    return pair[0] +'-to-'+ pair[1];
  });
}

Conversion.path = function conversionPath(types) {
  var pairs = zip(types.slice(0, types.length - 1), types.slice(1));
  return map(pairs, function(pair) {
    return Conversion.withTypes(pair[0], pair[1]);
  });
}

function convertSyncWrap(func) {
  if (func.length != 1) {
    throw new Error('sync conversion '+ func.id
      + ' should take 1 arg (input):\n' + func);
  }

  // simple application
  return function() {
    return func.apply(this, arguments);
  }
}

function convertAsyncWrap(func) {
  if (func.length != 2) {
    throw new Error('async conversion '+ func.id
      + ' should take 2 args (input, callback):\n' + func);
  }

  return function (input, callback) {
    if (!callback)
      throw new Error('Callback required. Async conversion ' + func.id);

    func(input, function(err, output) {
      // want to defer here, because user may not.
      if (err) {
        e = 'transformer conversion error in ' + func.id + '.\n'
        if (!(err instanceof Error)) {
          e += '  First callback param is neither null or Error.\n';
          e += '  Maybe calls `callback(out)` instead of';
          e += ' `callback(null, output)` ? \n';
        }
        defer(callback, new Error(e + err.toString()));
      } else {
        defer(callback, null, output);
      }
    });

    return new Error("This is an async conversion. Use callbacks.");
  };
}
