/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var config = require('config');
var log = require('libs/log')(module);
var auth = require('routes/auth');
var app = express();

// all environments
app.set('port', config.get('port'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
    app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);
app.get('/auth', auth.list);
app.get('/auth', auth.list);

http.createServer(app).listen(config.get('port'), function(){
    log.info('Express server listening on port ' + config.get('port'));
    log.info(getHash('work'));
});
/**
 * Get hash sum
 * @param input
 * @returns {*}
 */
function getHash(input){
    try{
        var shasum = require('crypto').createHash('sha1');
        shasum.update(input);
        return shasum.digest('hex');
    } catch (e) {
        log.info('Произошла ошибка: ' + e.value);
    }
}
log.info(user.auth('ms','02kf'));
log.info(user.getPublicKey(user.auth('ms','02kf')));
log.info(user.getPrivateKey(user.auth('ms','02kf')));