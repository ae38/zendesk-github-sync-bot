require('dotenv').config(); // this reads from .env file or uses default ENV variables 
var fetch = require('node-fetch'); // comment if you run on Zapier

module.exports = {
    // query external system for extended information about the user
    getExtendedCustomerInfo:function(name, email, clbkFunc) {
        console.log('run external CRM information query for ' + email);
        
        debugger;
        
        // return if CRM query URL is empty
        if (process.env.CRM_QUERY_URL == '')
        {
            var output = {
                label: '',
                info: 'EXTERNAL CRM ERROR OCCURED: no URL defined'
            };
            console.log(output.info);
            clbkFunc(output);
        }
        
        fetch(process.env.CRM_QUERY_URL + email)
            .then(function(res) {
                
                debugger;
                
                if (res.status !== 200 && res.status !== 201) {
                    console.log('* getExtendedCustomerInfo 0 error: status Code: ' + res.status);
                    return;
                }
                else if (res && (res.status === 200 || res.status === 201)) { // OK or created
                    return res.text();
                }
                else {
    
                    console.log('* getExtendedCustomerInfo ' + res.status);
    
                    if (clbkFunc)
                        clbkFunc(res.statusCode);
                }
            })
            .then(function(body) {
    
                debugger;
                
                var resjs = null;
                try {
                    resjs = JSON.parse(body);
                    
                    // assumes that external CRM returns JSON like this:
                    /*
                        {
                            "active":"active subscriptions information",
                            "expired":"expired subscriptions information",
                            "dashboard":"information or url about customer dashboard"
                        }
                    */
                    // preparing the header 
                    var info = '';
                    var label = ''; // label that will be matched with Github repo labels and so labels will be added
    
                    if (resjs.active) {
                        info += '**ACTIVE** SUBSCRIPTIONS: ' + resjs.active + '\r\n';
                        label = 'REGISTERED';
                    }
                    if (resjs.expired) {
                        info += '\r\n! **EXPIRED** SUBSCRIPTIONS: ' + resjs.expired + '\r\n';
                        // set EXPIRED if no active subscriptions were found
                        if (label) label += ','; // do NOT add spaces here!
                        label += 'EXPIRED';
                    }
                    if (!resjs.expired && !resjs.active) {
                        info += '! **NO SUBSCRIPTIONS FOUND**\r\n';
                        // if (label) label += ','; // do NOT add spaces here!
                        // label += 'TRIAL';  // not setting label at all for trial users
                    }
    
                    // adding url information if any for the user
                    if(resjs.dashboard)
                    {
                        info += 'User URL' + resjs.dashboard + '\r\n';
                    }
    
                }
                catch (err) {
                    info = 'ERROR - getExtendedCustomerInfo';
                    throw err;
                }
    
    
                var output = {
                    label: label,
                    info: info
                };
     
                clbkFunc(output);
            })
            .catch(
                function(err) {
                    var output = {
                        label: '',
                        info: 'CRM ERROR OCCURED'
                    };
                    console.log('* getExtendedCustomerInfo error' + JSON.stringify(err || ''));
                    clbkFunc(output);
                    throw err;
                }
            );
    
    }
}