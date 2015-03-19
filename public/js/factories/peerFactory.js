require('angular');

angular.module('webApp').factory('peerFactory', ['$http', 'transactionService', function ($http, transactionService) {

    var factory = {
        peer: {
            ip: "130.211.104.33",
            port: "7040"
        },
        peerList: [
            {
                ip: "130.211.104.33",
                port: "7040"
            },
            {
                ip: "130.211.72.188",
                port: "5040"
            },
            {
                ip: "130.211.72.188",
                port: "7040"
            }
        ],
        checkPeer: function (url, cb) {
            $http.get(url + "/peer/list", transactionService.createHeaders())
                .then(function (resp) {
                    cb(resp);
                }, function (err) {
                    cb(err);
                });
        },
        setPeer: function (ip, port) {
            this.peer = {
                ip: ip,
                port: port
            };
        },
        getUrl: function () {
            return "http://" + this.peer.ip + ":" + this.peer.port + "";
        }
    }

    return factory;

}]);