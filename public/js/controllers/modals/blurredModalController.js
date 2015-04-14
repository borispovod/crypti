angular.module('webApp').controller('BlurredModalController', ['$scope', '$rootScope', 'stBlurredDialog', function ($scope, $rootScope, stBlurredDialog) {
    // Get the data passed from the controller
    $scope.dialogData = stBlurredDialog.getDialogData();
    $scope.close = function () {
        $rootScope.$broadcast('edit-peer');
        stBlurredDialog.close();
    };
}]);