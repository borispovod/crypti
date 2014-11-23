var async = require('async');

//private
var modules, library;

//public
function Database(cb, scope) {
    library = scope;
}

Database.prototype.run = function (scope) {
    modules = scope;
}