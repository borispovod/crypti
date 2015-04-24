require('angular');

angular.module('webApp').factory('serverSocket', ["socketFactory", "$location", function (socketFactory, $location) {
    console.log($location.protocol() + '://' + $location.host() + ($location.port() ? ':' + $location.port() : ''), window.location.origin);
    var newIoSocket = io.connect($location.protocol() + '://' + $location.host() + ($location.port() ? ':' + $location.port() : ''));

    serverSocket = socketFactory({
        ioSocket: newIoSocket
    });

    serverSocket.forward('transactions');

    return serverSocket;
}]);