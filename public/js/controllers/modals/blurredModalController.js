angular.module('webApp').controller('BlurredModalController', ['$scope', 'stBlurredDialog', function ($scope, stBlurredDialog) {
    // Get the data passed from the controller
    $scope.dialogData = stBlurredDialog.getDialogData();
    $scope.close = function () {
        stBlurredDialog.close();
    };
}]);