require('angular');

angular.module('webApp').factory('registrationDelegateModal', function (btfModal) {
    return btfModal({
        controller: 'registrationDelegateModalController',
        templateUrl: 'partials/modals/registrationDelegateModal.html'
    });
});