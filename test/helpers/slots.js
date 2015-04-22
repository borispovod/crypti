var should = require("should");
var slotsHelper = require("../../helpers/slots.js");

describe("Slots helper", function(){
    it("Should return 0 on getSlotTime(0)", function(){

        should(slotsHelper.getSlotTime(0)).be.equal(0);
    });

    it('Should return slot as a number.', function(){
       should(slotsHelper.getTime()).have.type('number').greaterThan(0);
    });

    it('Should return a number as result of getSlotNumber()', function(){
        should(slotsHelper.getSlotNumber()).have.type('number').and.greaterThan(0);
    });

    it('Should return a number as result of a real time', function(){
        should(slotsHelper.getRealTime()).have.type('number').and.greaterThan(0);
    })
});
