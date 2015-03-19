require('angular');

angular.module('webApp').filter('uptimeFilter', function () {
    return function (uptime) {
        if (!uptime) {
            return '-';
        }

        return uptime + '%';
    }
});
