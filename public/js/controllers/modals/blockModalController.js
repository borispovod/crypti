require('angular');

angular.module('webApp').controller('blockModalController', ["$scope", "$http", "blockModal", function ($scope, $http, blockModal) {
    $scope.loading = true;
    $scope.transactions = [];
    $scope.getTransactionsOfBlock = function (blockId) {
        $http.get("/api/transactions/", {params: {blockId: blockId}})
            .then(function (resp) {
                $scope.transactions = resp.data.transactions;
                $scope.loading = false;
            });
    };

    $scope.getTransactionsOfBlock($scope.block.id);

    $scope.close = function () {
        blockModal.deactivate();
    }
}]);