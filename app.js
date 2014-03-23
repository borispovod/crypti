/*var express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    http = require('http'),
    path = require('path'),
    config = require('config'),
    log = require('libs/log')(module),
    auth = require('routes/auth'),
    app = express();*/
   
var express = require('express'),
    config = require('./config'),
    routes = require('./routes');

var app = express();

app.configure(function () {
    app.set("address", config.get("address"));
    app.set('port', config.get('port'));
    app.use(app.router);    
});

app.configure("development", function () {
    app.use(express.logger('dev'));
    app.use(express.errorHandler());
});

app.listen(app.get('port'), app.get('address'), function () {
    console.log("Crypti started: " + app.get("address") + ":" + app.get("port"));
    routes(app);
});

/*
app.get('/', routes.index);
app.get('/users', user.list);
app.get('/auth', auth.list);
app.get('/auth', auth.list);

http.createServer(app).listen(config.get('port'), function(){
    log.info('Express server listening on port ' + config.get('port'));
    log.info(getHash('work'));
});*/
/**
 * Get hash sum
 * @param input
 * @returns {*}
 */

/*
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
log.info(user.getPrivateKey(user.auth('ms','02kf')));*/