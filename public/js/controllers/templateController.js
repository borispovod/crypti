webApp.controller('templateController', ['$scope', '$rootScope', '$http', 'userService', "$interval", function($rootScope, $scope, $http, userService, $interval) {
    $scope.getSync = function () {
        $http.get("/api/isSync").then(function (resp) {
            if (resp.data.success) {
                $rootScope.sync = resp.data.sync;
                $rootScope.height = resp.data.height;
            }
        });
    }

    $scope.syncInterval = $interval(function () {
        $scope.getSync();
    }, 1000 * 10);

    $scope.getSync();
}]);