webApp.controller('blockModalController', ["$scope", "blockModal", function ($scope, blockModal) {
    $scope.addresses = $scope.block.addresses;
    $scope.transactions = $scope.block.transactions;

    $scope.close = function () {
        blockModal.deactivate();
    }
}]);