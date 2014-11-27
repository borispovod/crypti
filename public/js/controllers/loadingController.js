webApp.controller("loadingController", ["$scope", "$http", "$interval", "$window", function ($scope, $http, $interval, $window) {
    $scope.height = null;

    $scope.getHeight = function () {
        $http.get("/api/blocks/status")
            .then(function (resp) {
                if (resp.data.success) {
                    if (!resp.data.loaded) {
                        $scope.height = resp.data.height;
                        $scope.blocksCount = resp.data.blocksCount;
                    } else {
                        $window.location.href = '/';
                    }
                }
            });
    }

    $scope.getHeight();

    $scope.heightInterval = $interval(function () {
        $scope.getHeight();
    }, 2000);
}]);