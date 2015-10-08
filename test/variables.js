/**
 * Ask Sebastian if you have any questions. Last Edit: 25/08/2015
 */

'use strict';

// Requires and node configuration
var _ = require('lodash'),
	config = require('./config.json'),
	expect = require('chai').expect,
	supertest = require('supertest'),
	baseUrl = 'http://' + config.address + ':' + config.port,
	api = supertest(baseUrl + '/api'), // DEFINES THE NODE WE USE FOR THE TEST
	peer = supertest(baseUrl + '/peer'), // DEFINES THE NODE WE USE FOR PEER TESTS
	async = require('async'),
	request = require('request');

var normalizer = 100000000; // Use this to convert XCR amount to normal value
var blockTime = 10000; // Block time in miliseconds
var blockTimePlus = 12000; // Block time + 2 seconds in miliseconds
var version = "0.5.0" // Node version

// Holds Fee amounts for different transaction types.
var Fees = {
	voteFee : 100000000,
	usernameFee : 100000000,
	followFee : 100000000,
	transactionFee : 0.001,
	secondPasswordFee : 500000000,
	delegateRegistrationFee : 10000000000
};

var DappAscii = {
	icon: "H4sIAAAJbogC_-xdXW8et3K-ln9FoOvgBTn8zl2RnOIExckJ7Ka9qHPB3eU2gm3J1UfatMh_L1_J7zyTHUo5TmQLgvQisen95HJJzsNnnpk9fnVSv3j1Uz1vyxf_fPK2Hb84Njt7_OI_Xhz934ujo-Pv6rt2_NUXx1fv357VZff-9D-Pv9xv__qnNr-5uHrX9_VDj47Ml4_2z_7Hj9fP9JfzenF13l7NP7Wbh7551O9P2twuXrb_ujrprdS32-vNf39_efKuvn3Z5rOf2_kvN0f1vddXPf7Xs8v6drON_3ndYvvm3R94Xk8v1nZ-c-lY8k2tjo7_ab48-Xlfjcvzq_Zh28v2vp6cn_SX8NUXa317cdj-9dnp5XmdL_vmm8seHe9f5quT_91fwCYfvhSb_9bO37xtL8_OLg916T-y8cMxRzaYQzFa3ugyF43BVi75ciiSCdjKRZ-4xKcTdluLW-WEqogi3yDyRnJ8gUiHUvKHElcZVymoO5dQi-DwEDjHcdWIuBLeDg4lY29KPx4a_N9PTpez_351Wc_3rW1LKOm3u_5yet2nSs78kr6vv5xd7Q-naFMwv_kdjvm3-vZk-f787Gz9-9Xl-6vLC_EuP_SBm6Ou9l2Agg2er2XFhfpBP5y-PZvf_LVe_LTv9MllW2ies3XJUV79ampYvZ1q9HMJrk1hbVPr_w52psU0l6rz6zybhVIys5-S8cnUuSVz_OEev24a5W8nFxftk9Te_MlfLm0yS6y5xnJb7T_hHQ-3eNl-Prk4OTv97urd1M73M8j1jl834_3bb9BuPGitOYzkdOjNxIOTB5HNh8FBPBBs4b08GjHuiQ7beLwQ73OHXu3ctmB55BPxnbgevMnxvng4kwvOqzvT4SHDoVaJqxwPR3k87WGTpZsR-uFtHv_17OLy2--vO343fLbsbKKdNe6rUjJ9eB_H18P329Ol_c9hMt-bi9Nlu-l6hlez7s1mffp8_ku3IWen_9J-wWu0ieucEj9Q5raMvPdQ4gnFclP0AcydAa_B8ys13PiHEp_AL9Ly3G6Jrxb49nyxYtVOnp_5lsSXwAxqifdyH-NJ3HLXsvxe0VEz7p5-8za3sORg5J_g3zft8oJnjSHeEJ30M-MNa9g4E_CGTVzkd3zE1llgFKd2WthzgBJAAZhrW7Cfu-xRxoUAZAgnRexHzYE-BGYigTAIz4ibAkNYhwOAn1ASmMehVsBPNv8-3Ii3wQ2v4EafG202Yf_zKf9xtGFt9MGHbjpytuEuc73EtbXetpML0U6LDTX7qc1hribZtLSOReI6uxpDyWnKa6OpruQ6EHFzr2yZfPGxLGWJZrknsPGPV_7pYg3ujLAMEdYFpv2wjQcHejnMBkAEj9GgroDxZWF62LaxzcxBVSxbZTF52PJCg2DsgCe0lSSDZwuqPmy82LAVfwvWCLsONOwu5weDGfwgh7_xjtjyWpTS1rTbDLzGrcim3XCjc4vxBEpWWXtgRT6IJznibZbxLOb6wo1v1b1T3mLMvowADOQHP5QO3YMxFuVncPE4wYW0q2zDnSAzwmBFT5YAHPjYMjDswoJnDTp4aXIkQIPHbhALAmp40CtFAB4zgCo2oJ4uaiomAVkJ5gI1tQFFcVuBWyKej9ynRRj3ATG8v8tMTzkvlOcW2-wXv4bmp5WWVmuJc0q9XZeYXQcROc2VKMVSS1gitdnmKeXiA7Xk-2afyifBGHfX_gmDjKAIDV7qMtrAmMVAF_bab6wcrIRnW4IFt9MQhitBPKVYz7c0uDkgi9uiDJtIURTMtBCeko_yqkKwfFiBAwelcgfMoPKQdAa3pOWmT-AQin4WABOe2iKuURTflNCQ3JKRLTkaUBNbRpNRFvwDc0-YjonPxWFgzNKglvykADh8jcwoA1RbeMYbjxJvhDxwSMCL4fzAsmKiOILrg-HsURIgQFAPwjAzCAhBkyFhQK4QnBtgE-A_EeYfpwjcwiU8Q8QVAUnEKVkfCBoSo_MoxHv1mvg-d9jrn4km_QmviaNiiqHUf1TuNNNuSsHNxbneX0zseMNNppnQ10ZL31yCWSlXkzrkWKfYm3-iteTJzHZyoblaJlfsvNr-tnK-L6_JP177pwsysFokxuUwUFsbY7kbYvQymwg3IJaUMNwgALEI5U1JGywLAiNpoxfU8poGbhq3eQ6mQnLZLnVBjsCzgrYpdJvPxO_27pJgdkT0UBgDSAHrOqxmgPQIHhAu8VE5KrcLMWrgt5gBKLwik5SPjcRLpC10YCBH7B-z_IJ50SnYCauwZhogGOAh7s8AKf7ZW_JICQ3unr23s9mMecA5QKfhYZOzYDay1kkI4iMIagNGG7gEax4xuQmqEL3_qORBRaVWAnCFPZICzGA0yEpjouo9PGtnkRncU8AU7-4TabhCkcI96DNcSs7ytezdSMPROldnSjZ1mXOulkpZbe4wwvq5uW4msp3DTDa2OKfFxsUtHZkss611pjbVOfqYl96o94Q0PqL2TxdpAHNbthROr0WxoBQMeFLUPLwa8IWDkWezwysPC6OubAaYDaugA0yMwRI6bt00vLJAHUjz99hUNNGCOtOtYCNeCzTI5V3Zg434IGAjKC6J8QXhSbkhSZFYgkkyWmVj9Ot3Vrmf4MqiredLMERCOXEoJNUHeZZmUMmTMRxawIQpqxJzyKIbu2eg8TiBBlwbBa6FlAbuEiF5sIJvsEJCKXgPGlzMD2EHHC5CkwFTn4r2zBR4dgSUETJR7A9WnwSokAWi8gPMgv0k2BTREBnPkeixS0FjibEf6nNta6jUQscZxi8turVvzHOsc6DJpdgby6-V7OTyWqc09yluCVNzc2z9blNo1j9LQT8f1IBccKgIhI89Kxc-aHqxWNZ8vTBOebuejXrRG5JWGUBAAXsI45JpoBIkXsZuxYrgZXzQysc0aAX4em7TaNicd-RpF8ouxgfTaYBxiFE1GFpa4TVobSG_hZJiJNlwChpI-U1Wxwmfl1dAQzi4eGnIx0OFYbWyBvI8Uhdl-FKCQrH-WazxOCEH1v5JmFQhXEBRxKCA0ZCOFKGtEOBDQBKUotZ7WjAWkuYQ0lGIMMJIxeGEDwWnRw1dLDCQDmqBpkOgiZgG4hUBkO438CSQ24CNP4g2gnEm87XutNfe-Ui11NX5YmlNJs9uzWvqc0-ZKs1l6XWtZa0xJm9Sbb7MyU4mp7Lm2GztBpQaUer_uCe08RG1f8IuFIYRESyGVwELWUstERTAXR7jDnoIBhRs3OAS0dQF-FGx_s1bap7rDL9MHBDywqlvNs_BWEU4e7I2lwVqxFtwRky7btt3-_AT5x9epwG6hnkHLgivVIRqFxEmrN_FNYwW8GZNJgDbCapBeDy4K-TNW0BsHvxrRks8EMQkniVs9TZQFSFwhZFuEvV6RhqPndyw0kBjYxoIQEU4RhaBr8KnMOAZBDyBBlMEvtJAYSF9PGzY4QQRJIfwzEBbIhWeQFKOBtoTN-ZLinKiiIibQoIPeezMhrclBSKqrU1ESwcYmWpdQ8cedpndHNbo2hSXpaOPblqaW9epJFqnkCinsNopp1hMmeZKz8zG58MakFNE7ZeIQSnw4Bcl5hHgeFfxIFhgQPUnFBxsFDgCDDvF-jWqEFtAEhDwECmC4PBbgwtHAkpw5XirF-_QT_p4mx8l7DLtSt71QfBw8SdZre4RvAO5JjwXIKuEnysOMIWKCPFGNw60OmCfildCG6-Jo4E0Q8lqYGgE9xS3bjN-kVxTEY_Eso_4DDYeJdjIA1KihEHghVjE-5HZDmFAhch0GQAoceCFEVLPNBBRAGmU4X0oa54kjVwfJBwmOAlDWbI3UOgLMal4ZIhfbUyPXRqa-n1anhLFdTFrrP3EtIQcyK9lzqHNc4zZrqvN0-SbNTUHS_2parVtWsKcDJXWnyaaujxLQz-nNFTbGZ7yQaoDf5gBGHCKxIBegwcMj0YR1jIIZ7RbuMKGrWSlIARa4TUzwwvWQ4GwAAEDq8YoByKGBE4eAOw2vYazO7uPPolx92DxJyTcGlnBAJ694DaBk8lrysDroFF5WafcKzz5AmIiuhRONIFyBgHGbivegNsrbgEmomDIIFJIwduionI7UHkGGo-T1UBIiVBMwmkRB3m7yMkcEoAafhCPKlwxbuDUgC_4aKiDIBH9UpKKliWJdPIgukWEuAoVqB9VRezHnUAj_sY9E0ZMUH70xEahVvy8tuLSFIszee0mPq-UO_IIwaXSgUeK2VTnzT7XxkqTL6nE7OpsQi2hmmVacyiLSc_ExmckNmjrQwkITMlb0AELBrIBLnFYdRYkMvpgywRhJ5sc6P6iggBBp2MS9g4RsQiiSYqhJzvgSJh_9DrmFqpIkb_L3Za_K_tdH4e73P97OFoD4bxWx5SKDFxWCWIQ58NTN5wnPO3AT6LzegmKhEtCy-GUfhcYEQtCrL00ENL0DF-U-W6vo5i5S0MS8ow1HivWEE6IkTWWQR0i5ZUw10AGMQ6kpjI3RRxIPJIZhH9IPkPINuMo7FZwEyLWRHh20qiuVrA0QRAdTks1sNvn0V1F7hH36ONe8z4KJcW4xqXVxc8lTotxufpi4zQlb5Z1cWudFm-mYP1sTauxmtX2o2zxLeV0rRz1eYnP5MZnJDeEY6RspmchAES0CGMPgIMwUAImxSxYbcSAErw2l2BRRO4IlcYBRw2YEnFmUEEKpEMmRPwKXCoZh90mEDX5OhiFfEce3j8c5sg6uQX7gkHseK199apdeYNR-pisJSLwV3gVuCpUvUlj1LCFCyIAqOhMK8hKKpRFSTnVSJMfIug3-WfU8ShRBw0VmHHgIZExo047WKBVkjnEkZFCQgpBlvhBPi7h2BDRqyKJhtRmxpGMU6hBpYJkFIEC7YVTT58HklQSyCkjt8h9gg3r-6I-3vxCcvFPpPJyJR0uFlJydxlsWkxYi23LXL1bpzm1MMeyxmntr84tLs6-zakjDJqqWToAWEvxPhrfD8s-9KnFhWVxSwrlvuDGx1T_CUe_eh0bqbN2ZsU7QFLqNEcOERYp-w17L_QStM12LTw1WKWaQbLtpMIs4c5PWjqJe_KtmGaFLRMpz0Va9lvQRvEdbOzSrq85HgppsCeJJwpB_FiV3kSgR9LZUkXMEc_fYevOQDQ0SoxogDVIx9bKcGur9SJQ06BqWaXm8io2VnhVREp5rb5xz7KNR4o1hEZUpJAQicTTQBgqDHQamd4wikWBWlTSI3nggkkiefngKygiDTnoFzhjEF-TNKBA0LqIOxERJmUgc3X6wykigYe5V5iBhKEh2L6wv5eModmncmfK0HWtLQXTO0yZbF1tL85-7cDB2F5o00x-qTXsr9TWaJPNqYOK2V5n8PJmWoOfqJRAyX2ClKG_V_0nTGsU5WtAB4cnUKSpEPZIZStPOrUX2Hx4KZCVtGiJIqwEr1zdIKWG025_8nrZDNkixAOQNyJWVCQrdQqmYG1_q0TU-ryjYHf9vwcMSsHXo0T2NCT2YvsPnAbXBimRjNMfvBGN6HViWO4aaDqVUFZEsML74rZZVKBOFSldo04g5zY4CLDDqk3Ch0blGWw8SrAhVuyj74fASoc4-LqI-ALZECoI6aWJg8iTrLOFyiThbpDdw47QicjtQWGQd11SJSITR9IBOPJzbqNEHEJBKtK632uejb4oy_ej2uiNkRIudvdH10rwpnjvkk9rrT56V_IymZxrrbG54taymrgPi825w4xpbrOf8zrFmhY_e-qTau1IKbjpvmJfP6b6T5jXECtbs8UPIBwk9PAbrl0Q87A9UHQyaNcfcxM5pYTiNG1d8rgBEmXy0gZgpwyknXkrzmCWRKcTQcQ9jcIfbpNt2JQ7xjA7F3fZPphMFCnWeIJkFxYonLJ5dYOAHVLeMZ3QAqZfpWBDRaDNQCmrACT5YTWj454DKYeQeL3gZ0TGuLxVoeBt0jOr8VhZDWG40-B7J8JFIsgEGuUdFwINEYYqXRxAGDovOcy2-IhJHtEbdvDlWOHoiX6kZQ2j5xAZwwT5kkYZy8LwqlCExPvFGvsPparfH0QbpsODKC53N94Idl58qvPSFl86kFjm_mecKU2-TsGWDiumKU3OV78WanEKZl5KtmFx2ZFvvhtOU-d1nqb7whsf9QBPWCnKK0FS8gURLsrdn5XOWQc0wB8askISYUBr2G1cg0g7GdQH3fiOSRP1PCHlwWdGkRcCHn2nI36T-kIIvnN7-5fXrOv_78Wi_sGyeomn2jqF8JwAEIwJRKDygEQSKbeCxpaAg8jqhcgQkEhC38NI0ihAiHdllKeOp9agvx8HD7vwrnEriJS3TME9I47fRRz8Bfsfrr_S_309r-8uDmjhGhScfviM_9dfvX79w0U7v3j9-qJN9eLypOOTy9evv2kXby7P3r9-vfnO_9HxN1fndd9_9x-nP8zHx9-dzG8Ol1Rn8Gfu7V441Sv364sf_z8AAP__vBYIdGeA",
	app: "H4sIAAAJbogC_-xd244cR3J9Hn6FMM9EI-8XvRnSGisYqxVIy34w9ZBVlWU1SM7Qc5EtGfr3zZ5hxQlWZI9EbYuN4TQhUMWuW1ZWZsaJEyeizl9uyxcvfyxXdfriX7dv6vmzc7XR58_-69nZ_z87Ozv_tryt519-cV4vxquf391sN79s350_3-356sc6vr6-fdv2toPPztTzR_t3--uHu2f6y1W5vr2qL8cf6_1j3z_qd9s61usX9X9ut62f2u_67ue_t_54W968qOPlT_Xq5_uj2t67q57_--VNebP6jf5512O7Dt4deFUurud69f7Sxijj0vP7ff8y3mx_2rXk5uq2vv_tRX1Xtlfbi_9uP8_lzfXy-1eXFzdXZbxpP99f-ex890Zfbn_ZXcAqr4J5znb8rV69flNfXF7eLA1qf4zT74850yEsmyEvW5b2JhzosRn9c7pSpE2LX42jTa9wGt3AL208c3R7jQMdGqCw6RNtWrqSUQq3wl3pqtnhfOw2dL7DRbPGRQ02ab-hR_VoXrjf-mHp8__cXkyX__vyplztOlxnn-OHu_5ycTcAckrLVc6_Kz9f3u4Od8aGHM3uj7ZOZduebrn_-X-UN9vpu6vLy_nvtzfvbm-u2Qt9PxTuj7rdjQSnoo5WtQHhXVQpOHapdtj3F28ux9d_Ldc_7iaAHaK3Y7ZWR6fCZJIdVFVehzi1n7NXs0lFxRzGeQjG5sHMOQ1q1IP11ZY82KzHWbd3ndL5-3v8uuqYv22vr-uf1H71T_5JuQ5qCiWVkPe1_0-843KLF_Wn7fX28uLb27dDvdqtJ3c7fl1N_W--Rs9p6pRl8GqahsYt-4xfZlFeBn5bgZYtvZxKc6X1_HKmpeun5VRaPDJdgqaOVlpcgwb6cnmb1nu0XSasX6ZLmwHLFk087ZcTfKBbJ3qO5bCY6Exqg3vG3ub5Xy-vb775bvcio9tEs9Febdqk-zLnZN6_jvO7OfzNxVT_b1nZd7bjYlr_dLfcd9bf-x3yAvcm9vLi3-rPeI8xir6h56LF0ljqiCT6xji8d0d9GEUHa7owrad5PYQwXKgRYRkHgW7jxcjQyYmjLA0qWn91Xi5GIxQmRSf6LVjaWlqfPniNa3Sy2Pon-P_7fnlGy0UXdnwwPD856tAOVtvDhDpsRlhoS3YfAEXT-OcQIZAFx3Bvg43uhfXtjCbBGS1O7aQOFNEG9wSAcGyTbhoBIBQQEpqvNVpKWwy_sIsG2mSgyTKohosa_Zu4I-zDHU7gDqPbzE2h9ZTK0XuT_jDsMMr6FHxbs2Jw0aX0gNWewlyrDr6BiKCHSfuS3FBHP5ad7Z-qTTrMoy3B5xSHNFczlLmtJw2ojK3FeXDZhTzlKajpQKjjY5r_dEGHBTqglZ9wgqEBa2hqcTu0nEsLviGIj6VAAxkA4ADOwJAs9ycbmQQe0mSTYCqXO9KCYBTZR_JSaKLotOwkb0fHILCPSesTc96DOvwmb7TepHQ8xAG8oBVtRSBGt-pHwgS0J9KDC7Sgg3hpkVCMxo2XEwASgPpoaAFmhk6nK_EU8EkNgVxqNFxTuifGFWAV3ceeAMfjBRzMdoKnSLCtQA4Kth8sBgMmIElAEuAMXJtOARKh1YCDDsPgCSNIGJZgv4JiYVgJWCCAAclyi7EuhubbGSFw9kAaD0zu1Y7VOSTScD76bFd26Q8yHDZHF1JcrqbVA8Y6NjCRzTimhiGtSbObVfGz00MJDU94Wwc_16G2f3s9mklVG4t18ziqycSoRjdE5aIqY43qUAzHx7T_6YIN8ABktcFKttFHsINcRLLROIHmAPONsyAJ2Ak0P8AqwGkl-wXnm2ZWdAL9wBpasoGEFTTaAWeY4D-ISI1W6izoEMbmJLWP6VANcjTYsaM7lD0e8CB3jNE0guoAH2AIvzXnhPZGCQqToA0M3YqRI513ABibs9hJwJY8SoKwWjnBoYGiIeKXaDWjQGQBotCwAkAizKRP6OPxoo-EeAEZ1hA7jj1I1rOEwAjbDbNtOtEW0AY5C3DC-AUsMG2O0NVZVER12BNwDiCR2QLF0UnUHc6DR13AejAqBZwOOBVEeoyNn0OAJaqoahqiCfOk5lBMVnHyyRs35zH5Oo4hJD3POg2Dq1qV5Bsay7EUXYfJj1GZXNsTBVWmU4DlU8IPIrKzxByaVoEIkkL6y0GYdS_Jbg-jQuREXpsg5h17QVwQSQGvF4AGoR0YwvUGfGQCLMAXTjAmiMqEfZDD6k3DN5vmt2-OCDjAPiHu7XvoL4g4i0VUbfmJ6Gb0repEOLzkLAAIsxwIOQg6jNZItIK99izO1ACLIFuM5ELAmoEoscCZJ8jxaCEHLDD8e27VJXlgYHQRnWFEgOYhFSbQMF19R-j9mmwvKANYwBAEozLADYJO_SAUhFiK6dyKXd6zrgBSip2oCqjrNss_B9iRclIlhjCHqZbJjTkMk7KpuKzDMESnpnmycxkmpwav3ahVLaGoWbejdHY1pujm0jywNIUT7PikrAd0FIiuE7cAQECiLJAHRI4oEasAOQE5QFBCsAEJiZNGiXZRtIPaR36rE2aF_F0wMWT6XJZsDkI8HooVETYwRu9BHu2YTfObNs392TRn44hsB-Mllq2gJaNBvcj4Dg1MCOKAoJkMcCUrgClYCEPwhvV3lDKfIAYBoGmHMcGaqXtEDcFnvEd4pFonwWmFfMIfjxZ_ZN9hAEzo8Bw84BJ6YAOkhgZuQXgFhCeLFfP4BxNg5E4AhsVEwKP0YAi4F4z-DzQfLDiTpbyDnQ72BVOc0X8sztlwziHRR0_dcSB5h30oZjGkNJk01lBHN7nZVzfMpgGRksMYY1vJppAaLppSHEvzU0Iu2U_B1FGnIabsvKnRtZ9dzH-WvsOeYi5d0iMLkoCpC0VsAnwBGXVoLaBeBLmfECTJaykonUm4nJAGd3DhtdNe8n6sOBN-uRPaVYIm2QpURfQMDqfnj_YBcceO9ThqkIWIZAQdsCZm7NRrOIGfDMMCRoarYO4h1oGM1Qm5Kd4UICdeh10HhSAIBVIkCOitEJP0nhOtZdIi8CV8QJ5Qx6NFHVz2aUMHQSRGOwCMAEHk0GEdYK57AQotr82QBGNVOLthO0kruQN-WMgEgg9EkxihAiDBBCMpdXSskZE3z2WEyih3UMLjSDIP11wa395sqXUwZkp5SKaU2c_W6Wm0o5-DrUOYpgY_Gh6qdp6HHM08-GhS9LMeUgMcKg8NkZxkHschPNhCboxc0mkYIvrOPMqQBFsAZr1Hz5OrSvNdXgGReSvtj6TyIXYlKiZIRxuSEQAXhCAQU6AnokDUPn2H3ySzyWnTuuiYfEdcZZXIZBLkdUBiSwQA9RkF3AjrUQzGBGnWZSYJjD-RThgB5H_SwghmxQlRMx8wMlsKT6Fk4gxCdggExRPaeMSiUjKvthdGYcIMzF02szkw4ZIKaDdYoq2KnQsgY4VtMb4DAlfwrx_kmbC7RqZxpV9TR3nCUmL5OaYTcGGKENfjUXBSM8F_DtGh20wM3il3CKYjRtWu6d1DVMc8lxq9is7nQZdZt83RzZOdlG4bdRiNm0rxKSVX59BW_AYIpjjqu6RZp4bZu8Hk3O5mD091_I4HeMLAg-KDiCnCqpB7GY3wdpExss7dNGTNwI4z1nsd3wdJnteBmqRFzgqIdJpz9AgE_WkNiDLMgjQHiEoJI-EonnizL8ri0sZ4vWn_aXvMIAuCRACPUchuIMWgngtGsllu_V41me5sZYAqivyi2BF_IIKzDrRAy4o8FHBmWuTRgm0BYeWESBVNZiGmE-x4vCQHEEboEAWYyTy3lIVWWB0M2F92gEGYJulOwkgnAcaZB5WjjJxgfAcTbrDWs4ayXxEQyUAPAeghdwSj4BtZxJMHpoL-HIiObGp241yzjUNoDUhzs_JpNknNwXsbs08-hqSKdWqXVjubweWYQ7JlVL5kX9Q0zMnnScUT0fFJK3Z45C6sQQLh-eCEvJMnM9CKjohFEkpUIiToKMg_6MUgkwb2UgvLQVvJrA8C4aLXJhUuCyY9ewolHH0QLdqaPZAjuU2biZvU_jsiy2EFvGJkA_gmIEvkRHuhx4AZB1fAwJcXWMB3JJ2iwAutYtQewoRMvOHWATLkrxglE7QxdpMXT8RAGAiRUwbLI5ZzdEw9k2Ca0CtSwbNmmc_PSmOoTsgDCMJ0IhqmS26YrgiVRT9Av_jYqyKWbS8TmAlLgsRU7EGQWMuzdX2PfWl-5CFRR9a-Ne4gqCPF7BqIcOF3hVesC6bkMluXtZmjSqOdG_RonZqHYsY8tfaWPJcQolOxVJfHqAfVbjKnUHVpZtRUY2L7x4FQx0e1_wmjDgr1IR2FbJgw3NLpzFLGR0AdAlAvaXlwIr5T8COKZFkvqoxBMcoSX_U6CYOVIoFskogVn4S3Hnv5PHEP6gjxLolll0J7VJ4DwZUoi2SBK0BOCyum5UUeCqCFkpVamKkPIlcVJDe7P-qviXAI3FP4meSRghkDMOngEWBirddl0PI6CGfMqVLYYyY7cqfAaNYdSSgvEApsALaDoQ3zYPUuXv0TVzS9MhpdMIGSplzTqXKHreAcB4quMjiFQmLsWpikLAITegIQPL0LnwPZEXIIrq3cqdTZF1N9zrNyUw123tXoGkMZvRlsDNq4u3yVwaa5DHFsCGzyQ7VjqF77wVftTmTHp4QdSZbsgHKTqmL4lV_rxB7MI8LUIB6CzCzIskYVSncFWfcKhZ8gZWXlxqxMtnVCxgHL5rTQImRB8dCNwj4daXNlNsaZjc-bEI4HOpLIWo1OQg6bRJwJGAXV2RBucUJBg1Wd1YtzQp2LIi1IZEGJWUmSQbDcqdsShcIV2lhEYQi90FMSzUL4RJ3wxuPFGzxNA8iDFaHoyTnBSjAmgMk0WI1TKCJoCzkmoBmACxCjYaJTWZ0LiCB0-BVeLgxST45JWDCFoYvcy-hFPRJeUSQjwnJIpBFSsCn7QyCN4HNoHqdarvagpbaDNfNY2tFJlWlMqWjTwIZO1RbtxmrbUEh69GOzEzWMcdJhslO2dhp1KaOpQxlDwwWTjocqhP5R7X_CBAerEumFdhIEIdh54jZipwg1sjahAYxC6okCp8hCScJFzyJ9gdXZhPPL-PawJmLg5SAZE5ACNc2i9PsBd0CC-H08Rwx3NcJ2mbN5Vw09HKs2qex0BFhAZaV1URJQzixwRsEnRGGULPQGOpkd5uWY0p3C8yKwwkrVSTwJBBw7Fe1YvrARaTJW5oLnk6rjsyiJjirlLC7BKlYYmbuq2WdcXE8hgSoXqAPzgUCV0xO28yEWxrMg8GF4RQ3bU7iaDv0C1q5NBdNjWJhyA_Gkbkl41i2s2_xBIYjxzuhk7_60VShYG_64mNQ5q2y6u1zDVDshxgNG3EzKz1nXaSzOzsMYqx9DnsMwG5PsZMPo6hhLKGYoaooxzjk7F5RrhyXnmyW0fmqwJDbkcCgx6Uc9wBPmO4Rpgn3RQsAX5LLObE8S5qKTeQuGJMoPr7BMFFop4DMHbAl3GPVBgPtZVQf20RGhDMmiC7QURMR9ACS7Bj42cdOcq2OGWfJaWIt8EZYJTVgMtAatbCwcFUQ_sGiIWtdARXKsTzJx1wpFDUqPoiBZEGVhSbWHbCiAJhME78JKwHlRegTQp63_J_TxeGkP5I-wKhSqV_rTdCqH8g-mIUrDinwyKYXqRUdcrxwYorwfhExYFRGgCyhhGb2BI9Em3UEhTN7BoQWyb3Kv2AirbIqGWnVQ5GFSs6_-IHGW1pspWmfpcg9XSc_eqYYlbHRxLsUFZ3OaBpVSKSVUm-2cZxV20o-URt2wSR3dmOYhlDi50Zm2xhatk7fDofQdH_cATziNBdrJEKUHqURpLigMSXJB1iXI6phOikO0pCmAJLRMgARsAOOCYu2QeTB0kztlJ7KoN8WSQGXSBxNJQv_q9iXR6pg22qqNDZukj5nQ4oVshmQqqKgBsaeRva1lkZXo95ePBaAAkgxrqwY9kAyiyW-zgE9D9M-sUS2LHDHRa5S4y4h6ZMafwMc_AT6CVuSpH6FWqZPfnWWAhCWMGh5T6UoutSwmjkIgQBmpk6XCojwu9hJ3gUxsjwDhn4uhTUbg9EWqrAYH-6AMWopcXBah6dY0Tb-dzpL2QY8gFR4qGr_LFz0E9rBZ74BEczTj77Ldzvuk54Yh0uyD1mMxaTAx1KrTMMVs5oZGBjcNpqEQM8Q4-tJ8UjeodoYdJ2_CrLQbhuahHQh8fOwTPN0vwknyAas0YiN2Xb8UjgWSTUKnwriThb-MsIvs8xooPwUvF4iEfaPDSmygZJFL5vBqkXPL6prJKqdBFt3eV7I07Sp3hLuKpa0NX8ajlUtnn9dbYwNWdtx1wlqIXSiR28y-2JZFGCbKj-CgAgphBgALer_BCehHoCMKdSsSklRHHkJhNFAeTmb5sgL4p1Lpvw0_6Kv73797c1mm78pVeXu9AIc7dHBR7r_C_9WXr159f12vrl-9uq5Dub7ZNrBy8-rV1_X69c3lu1ev6vvxuvll--5-Zpx_fXtVdgN4h2aWhfn82-34erlo5xz6PP9dTkZr4K_PfvhHAAAA__8Yf_v8IYEA"
};

var DappGit = {
	icon:"http://orig07.deviantart.net/a7d7/f/2012/151/5/2/meme_me_encanta_png_by_agustifran-d51rxv9.png",
	git: "git@github.com:crypti/cryptipad.git"
};

// Account info for delegate to register manually
var Daccount = {
	'address': '9946841100442405851C',
	'publicKey': 'caf0f4c00cf9240771975e42b6672c88a832f98f01825dda6e001e2aab0bc0cc',
	'password': "1234",
	'secondPassword' : "12345",
	'balance': 0,
	'delegateName':'sebastian',
	'username':'bdevelle'
};

// Existing delegate account in blockchain
var Eaccount = {
	'address': '17604940945017291637C',
	'publicKey': 'f143730cbb5c42a9a02f183f8ee7b4b2ade158cb179b12777714edf27b4fcf3e',
	'password': "GwRr0RlSi",
	'balance': 0,
	'delegateName': 'genesisDelegate100'
};

// List of all transaction types codes
var TxTypes = {
	SEND : 0,
	SIGNATURE : 1,
	DELEGATE : 2,
	VOTE : 3,
	USERNAME : 4,
	FOLLOW : 5,
	MESSAGE : 6,
	AVATAR : 7,
	MULTI: 8,
	DAPP: 9
};

var DappType = {
	DAPP : 0,
	FILE: 1
};

var DappCategory = {
	"Common": 0,
	"Business": 1,
	"Catalogs": 2,
	"Education": 3,
	"Entertainment": 4,
	"Multimedia": 5,
	"Networking": 6,
	"Utilities": 7,
	"Games": 8
};

// Account info for foundation account - XCR > 1,000,000 | Needed for voting, registrations and Tx
var Faccount = {
	'address': '2334212999465599568C',
	'publicKey': '631b91fa537f74e23addccd30555fbc7729ea267c7e0517cbf1bfcc46354abc3',
	'password': "F3DP835EBuZMAhiuYn2AzhJh1lz8glLolghCMD4X8lRh5v2GlcBWws7plIDUuPjf3GUTOnyYEfXQx7cH",
	'balance': 0
};

// Random XCR Amount
var XCR = Math.floor(Math.random() * (100000 * 100000000)) + 1; // remove 1 x 0 for reduced fees (delegate + Tx)

// Used to create random delegates names
function randomDelegateName()
{
	var size = randomNumber(1,20); // Min. delegate name size is 1, Max. delegate name is 20
	var delegateName = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.";

	for( var i=0; i < size; i++ )
		delegateName += possible.charAt(Math.floor(Math.random() * possible.length));

	return delegateName;
}

// Randomize a property from within an object
function randomProperty(obj, needKey){
	var keys = Object.keys(obj)

	if (!needKey) {
		return obj[keys[keys.length * Math.random() << 0]];
	} else {
		return keys[keys.length * Math.random() << 0];
	}
};

// Randomizes XCR amount
function randomizeXCR(){
	return Math.floor(Math.random() * (10000 * 100000000)) + (1000 * 100000000);
}
// Returns current block height
function getHeight(cb) {
	request({
		type: "GET",
		url: baseUrl + "/api/blocks/getHeight",
		json: true
	}, function (err, resp, body) {
		if (err || resp.statusCode != 200) {
			return cb(err || "Status code is not 200 (getHeight)");
		} else {
			return cb(null, body.height);
		}
	})
}

function onNewBlock(cb) {
	getHeight(function (err, height) {
		console.log("height: " + height);
		if (err) {
			return cb(err);
		} else {
			waitForNewBlock(height, cb);
		}
	});
}

// Function used to wait until a new block has been created
function waitForNewBlock(height, cb) {
	var actualHeight = height;
	async.doWhilst(
		function (cb) {
			request({
				type: "GET",
				url: baseUrl + "/api/blocks/getHeight",
				json: true
			}, function (err, resp, body) {
				if (err || resp.statusCode != 200) {
					return cb(err || "Got incorrect status");
				}

				if (height + 2 == body.height) {
					height = body.height;
				}

				setTimeout(cb, 1000);
			});
		},
		function () {
			return actualHeight == height;
		},
		function (err) {
			if (err) {
				return setImmediate(cb, err);
			} else {
				return setImmediate(cb, null, height);
			}
		}
	)
}

// Adds peers to local node
function addPeers(numOfPeers, cb) {
	var operatingSystems = ['win32','win64','ubuntu','debian', 'centos'];
	var ports = [4060, 5060, 8040, 7040];
	var sharePortOptions = [0,1];
	var os,version,port,sharePort;

	var i = 0;
	async.whilst(function () {
		return i < numOfPeers
	}, function (next) {
		os = operatingSystems[randomizeSelection(operatingSystems.length)];
		version = config.version;
		port = ports[randomizeSelection(ports.length)];
		// sharePort = sharePortOptions[randomizeSelection(sharePortOptions.length)];

		request({
			type: "GET",
			url: baseUrl + "/peer/height",
			json: true,
			headers: {
				'version': version,
				'port': port,
				'share-port': 0,
				'os': os
			}
		}, function (err, resp, body) {
			if (err || resp.statusCode != 200) {
				return next(err || "Status code is not 200 (getHeight)");
			} else {
				i++;
				next();
			}
		})
	}, function (err) {
		return cb(err);
	});
}

// Used to randomize selecting from within an array. Requires array length
function randomizeSelection(length){
	return Math.floor(Math.random() * length);
}

// Returns a random number between min (inclusive) and max (exclusive)
function randomNumber(min, max) {
	return  Math.floor(Math.random() * (max - min) + min);
}

// Calculates the expected fee from a transaction
function expectedFee(amount){
	return parseInt(amount * Fees.transactionFee);
}

// Used to create random usernames
function randomUsername(){
	var size = randomNumber(1,16); // Min. username size is 1, Max. username size is 16
	var username = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.";

	for( var i=0; i < size; i++ )
		username += possible.charAt(Math.floor(Math.random() * possible.length));

	return username;
}

function randomCapitalUsername(){
	var size = randomNumber(1,16); // Min. username size is 1, Max. username size is 16
	var username = "A";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$&_.";

	for( var i=0; i < size-1; i++ )
		username += possible.charAt(Math.floor(Math.random() * possible.length));

	return username;
}

// Used to create random basic accounts
function randomAccount(){
	var account = {
		'address' : '',
		'publicKey' : '',
		'password' : "",
		'secondPassword': "",
		'delegateName' : "",
		'username':"",
		'balance': 0
	};

	account.password = randomPassword();
	account.secondPassword = randomPassword();
	account.delegateName = randomDelegateName();
	account.username =  randomUsername();

	return account;
}

// Used to create random transaction accounts (holds additional info to regular account)
function randomTxAccount(){
	return _.defaults(randomAccount(), {
		sentAmount:'',
		paidFee: '',
		totalPaidFee: '',
		transactions: []
	})
}

// Used to create random passwords
function randomPassword(){
	return Math.random().toString(36).substring(7);
}

// Exports variables and functions for access from other files
module.exports = {
	api: api,
	peer : peer,
	crypti : require('./cryptijs'),
	supertest: supertest,
	expect: expect,
	version: version,
	XCR: XCR,
	Faccount: Faccount,
	Daccount: Daccount,
	Eaccount: Eaccount,
	TxTypes: TxTypes,
	DappType: DappType,
	DappCategory: DappCategory,
	DappAscii: DappAscii,
	DappGit: DappGit,
	Fees: Fees,
	normalizer: normalizer,
	blockTime: blockTime,
	blockTimePlus: blockTimePlus,
	randomProperty: randomProperty,
	randomDelegateName: randomDelegateName,
	randomizeXCR: randomizeXCR,
	randomPassword: randomPassword,
	randomAccount: randomAccount,
	randomTxAccount: randomTxAccount,
	randomUsername: randomUsername,
	randomNumber: randomNumber,
	randomCapitalUsername: randomCapitalUsername,
	expectedFee:expectedFee,
	addPeers:addPeers,
	peers_config: config.mocha.peers,
	config: config,
	waitForNewBlock: waitForNewBlock,
	getHeight: getHeight,
	onNewBlock: onNewBlock
};