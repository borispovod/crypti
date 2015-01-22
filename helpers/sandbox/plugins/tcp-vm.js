var net = require('net');
var fs = require('fs');

module.exports = function(done, scope) {
    scope.tcpServer = function(done, socket) {
        var server = new net.Server();

        var connection;

        scope.tcp = scope.$new({
            send : function(message) {
                connection.write(JSON.stringify(message) + "\r\n");
            }
        });

        server.on('listening', function(){
            done();
        });

        server.on('error', function(err){
            scope.send({
                type : 'error',
                error : {
                    message : err.message
                }
            });
        });

        server.on('connection', function(conn){
            var data = '';
            connection = conn;
            conn.on('data', function(chunk){
                data += chunk;
                var pos, slice, message;

                while (~ (pos = data.indexOf('\r\n'))) {
                    slice = data.slice(0, pos);
                    data = data.slice(pos + 2);

                    try {
                        message = JSON.parse(slice);
                    } catch (err) {
                        // TODO Send invalid message response...
                    }

                    if (message.type === 'call') {
                        scope.exec(message, function(result){
                            conn.write(JSON.stringify(result) + "\r\n");
                        });
                    }

                    scope.tcp.emit('message', message);
                }
            });
        });

        if (fs.existsSync(socket)) fs.unlinkSync(socket);
        server.listen(socket);
    };
    done();
};
