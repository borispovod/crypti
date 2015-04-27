require('angular');

angular.module('webApp').controller('userInfoController', ["$scope", "$http", "userInfo", function ($scope, $http, userInfo) {

    console.log($scope.userId);
    $scope.transactions = {view: false, list: [1]};
    $scope.toggleTransactions = function () {
        $scope.transactions.view = !$scope.transactions.view;
    }
    $scope.close = function () {
        userInfo.deactivate();
    }
}]);