var should = require("should");
var slotsHelper = require("../../helpers/slots.js");

describe("Slots helper", function(){
    it("Should return 0 on getSlotTime(0)", function(){

        should(slotsHelper.getSlotTime(0)).be.equal(0);
    });
});
