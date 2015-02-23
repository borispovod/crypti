require('angular');

angular.module('webApp').controller('delegatesController', ['$scope', '$rootScope', '$http', "userService", "$interval", "$filter", "ngTableParams", function ($rootScope, $scope, $http, userService, $interval, $filter, ngTableParams) {
    $scope.address = userService.address;
    var data = [];
    $scope.getDelegates = function () {
        $http.get("/api/delegates/", {params: {orderBy: "vote:desc", limit: 10, offset:0}})
            .then(function (resp) {
                var data = resp.data.delegates;
                $scope.tableTopDelegates = new ngTableParams({
                    page: 1,            // show first page
                    count: 101           // count per page

                }, {
                    counts: [], // hide page counts control
                    total: data.length, // length of data

                    getData: function ($defer, params) {

                        $defer.resolve(data);
                    }
                });
            });
    }();


}]);