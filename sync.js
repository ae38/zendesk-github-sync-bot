require('dotenv').config(); // this reads from .env file or uses default ENV variables 
//var escape = require('escape-html');
var autoTextReplacements = require('./autoTextReplacements.js');
var extendedCustomerInfo = require('./extendedCustomerInfo.js');

// check if .env file or env variable are defined? if not then exit

if (process.env.ZENDESK_SUBDOMAIN == null || process.env.ZENDESK_SUBDOMAIN == '')
{
    console.log('Please define ENV variables. Aborting.');
    return -1; // return error
}

// ------ THE CONFIG IS HERE ------
var fetch = require('node-fetch'); // comment if you run on Zapier
var argv = require('yargs').argv;

// TESTING ONLY: set filter for just one ticket so others will be ignored
var filterzendeskTicketId = process.env.TESTING_ZENDESK_TICKET_ID; // 12364 // testing ticket in zendesk

if (filterzendeskTicketId && filterzendeskTicketId != '')
{
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');    
    console.log('ATTENTION - TEST MODE: working with ONLY ONE SINGLE Zendesk ticket id: ' + filterzendeskTicketId);
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');        
}

// words that triggers actions inside comments in github
// the app scans for comments with this keywords to trigger github to zendesk copying
var githubCommandWords = {
    solution: 'tksolution', // this word is not natural but its rare so it the chance of this to appear occasionally is pretty low
    copyIssue: 'tkcopy', // use the commend to copy issue into another repo like this "tkcopy reponame"
    addArticle: 'tkadd', // use the commend to publish comment as KB article on Zendesk
    reopen: '$reopen', // the command to reopen the github ticket after copuing to zendesk (will be closed otherwise)
    solved: '$solved' // the command to mark ticket as solved 
};

// defines if we should search for "solution" command inside open tickets only or in closed ones too
var githubScanOpenTicketsForSolutionOnly = false;

// messages helpers
var messageHelpers = {
    // header of the reply in zendesk
    zendeskReplyHeader: 'Hi,\r\n\r\n',
    // footer of the reply in zendesk when it is NOT yet solved
    zendeskReplyFooter: '\r\n\r\nLooking forward to your reply!',
    // message that is sent to user after it was processed and copied to github 
    zendeskOnHoldMessage: 'Hi,\r\n\r\nThank you for writing us! \
\r\n\r\nYour message was copied to our pre-sales engineer, and we will back to you with the answer soon. If the pre-sales engineer can not resolve the issue, we will re-route it to the product developer. The status of your request has been changed to On Hold.\
\r\n\r\nHow long will it take? \
\r\n\r\n- Questions about existing functionality (or if there is a walkaround for the issue), requests for a sample source code: 1-2 business days;\
\r\n- Issue which requires to make a fix or update by the product developer: 2-4 business days or more;\
\r\n- Complex requests and requests for a new functionality may need more information so the product manager for next versions of the product;\
\r\n\r\n\
\r\n\r\nPlease notice that we process questions from registered customers with the higher priority. Feel free to send more details just by replying to this message',
};

// set to FALSE to send messageHelpers.zendeskOnHoldMessage when ticket is copied to Github for the very first time
// set to TRUE to send messageHelpers.zendeskOnHoldMessage every time the comment is copied to Github
var zendeskSendOnHoldMessageAlways = false;


// defiens tag to be added to zendesk ticket if this zendesk ticket is from very first time new user
// set to "" if you DON'T want to add tags into new zendesk tickets
// why you may need it? You may define automation in Zendesk to autosend follow up the ticket 
var zendeskTagToMarkNewTickets = "leads";

// ------ MORE CONFIG ------

// debugging purposes: defines global status variable to store execution status
global.status = '';

// ------ THE MAIN RUNNING FUNCTION - SELECT WHAT TO RUN HERE 

if (!argv.step) {
    console.log(argv._);
    console.log('NO steps to run! USAGE: node sync.js --step [zendesk-github|github-zendesk|github-copy|github-zendesk-kb] ');
    return;
}

// #1 updating/creating github from new ticket in zendesk
if (argv.step == 'zendesk-github') {
    console.log('step 1: running zendesk tickets to github issues');

    console.log('checking New zendesk tickets');
    zendeskRequest('GET', 'search.json?query=type:ticket+status:new', '', copyZendeskTicketsAndPassToGithub);
    console.log('checking Re-Open zendesk tickets');
    zendeskRequest('GET', 'search.json?query=type:ticket+status:open', '', copyZendeskTicketsAndPassToGithub);
}

// #2 searching for the closing comment in github to sync it back to zendesk
if (argv.step == 'github-zendesk') {
    console.log('step 2: running github issues to zendesk tickets');
    console.log(githubToZendesk(process.env.GITHUB_REPO_NAME_OUTGOING, function(err, data) {
        console.log(err, data);
        if (!data)
            data = err;
        callback(err, data);
    }));
}

// #2 searching for the closing comment in github to sync it back to zendesk
if (argv.step == 'github-copy') {
    console.log('step 3: copying issues inside github');
    console.log(githubCopyIssue(process.env.GITHUB_REPO_NAME_OUTGOING, process.env.GITHUB_ORGANIZATION, function(err, data) {
        console.log(err, data);
        if (!data)
            data = err;
        callback(err, data);
    }));
}

// #2 searching for the closing comment in github to sync it back to zendesk
if (argv.step == 'github-zendesk-kb') {
    console.log('step 4: publishing comments from github to articles in zendesk KB');
    console.log(githubToZendeskKnowledgebase(process.env.GITHUB_REPO_NAME_OUTGOING, process.env.GITHUB_ORGANIZATION, function(err, data) {
        console.log(err, data);
        if (!data)
            data = err;
        callback(err, data);
    }));
}

return 1;

// shortens a string to given number of words 
function shorten(theString, numWords) {
    if (!theString || theString.length == 0)
        return "";
    var expString = theString.split(/\s+/, numWords);
    var theNewString = expString.join(" ");
    return theNewString;
}

function copyZendeskTicketsAndPassToGithub(data) {

    // iterate through zendesk tickets
    data.results.forEach(zendeskTicket => {

        // check if we should filter tickets
        if (filterzendeskTicketId && filterzendeskTicketId !== '' && zendeskTicket.id != filterzendeskTicketId)
            return null;

        // custom field in zendesk : product field
        var field1 = null;
        field1 = zendeskTicket.custom_fields.find(field => field.id.toString() === process.env.ZENDESK_PRODUCT_FIELD_ID); // custom field

        // custom field in zendesk: github url
        var field2 = null;
        field2 = zendeskTicket.custom_fields.find(field => field.id.toString() === process.env.ZENDESK_GITHUB_URL_FIELD_ID); // custom field2

        // set the custom field to empty if some another link there
        if (field1 && field1.value && field1.value.search('github') == -1)
            field1.value = '';

        console.log('ticket field1 = ' + field1.value);
        console.log('ticket field2 = ' + field2.value);



        // request information about the ticket submitter from zendesk
        // we have ticket.requester_id (mandatory) - id of user created the request
        // we may also check ticket.submitter_id (optional) - id of user submitted the user (in case of forwarded email it will contain id of the user who forwarded email to support)
        zendeskRequest('GET', 'users/' + zendeskTicket.requester_id + '.json', '', zendeskUser => {

            var name = '';
            var email = '';

            if (zendeskUser) {
                name = zendeskUser.user.name;
                email = zendeskUser.user.email;
            }

            debugger;

            if (extendedCustomerInfo){
                // request info about user from crm
                extendedCustomerInfo.getExtendedCustomerInfo(name, email, userInfo => {
                    
                    // add name and email to the structure
                    userInfo.name = name;
                    userInfo.email = email;
                    
                    updateGithubIssue(zendeskTicket.id, userInfo, field1.value, field2.value, process.env.GITHUB_REPO_NAME_INCOMING, function(err, data) {
                        console.log(err, data);
                        if (!data)
                            data = err;
                        //callback(err, data);
                    });
                });
                
            }
            else {
                
                // create empty structure
                var userInfo = {
                    label: '',
                    info: '',
                    name: name,
                    email: email
                };
                
                updateGithubIssue(zendeskTicket.id, userInfo, field1.value, field2.value, process.env.GITHUB_REPO_NAME_INCOMING, function(err, data) {
                    console.log(err, data);
                    if (!data)
                        data = err;
                    //callback(err, data);
                });
            };
                
        });

    });
    console.log('step 1: done');
}


// ------ THE COMMON CODE GOES BELOW - DO NOT CHANGE ------

function buildErrorMessage(method, path, postData, res, body) {
    if (postData && postData.content && postData.content.length > 300) {
        postData.content = postData.content.slice(0, 300);
    }
    if (body && body.length > 300) {
        body = body.slice(0, 300);
    }
    return ' ' + method + ' ' + path + ' postData:' + JSON.stringify(postData) + ' Response:' + (res && ((res.statusCode || res.status) + ' ' + res.statusMessage)) + ' Body:' + body;
}

function logError(msg) {
    console.log(msg);
}

function escapeHTML(s) {
    if (!s || s.length == 0)
        return '';

    //    return escape(s); // based on "escape-html" npm but it replaced " to &quote; which is not good for titles and links inside

    //return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;') // commented out as broke markdown inside body!
    //       .replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return s; // no escaping as may broke down markdown

}

function zendeskRequest(method, path, postData, clbkFunc) {

    var urlReq = 'https://' + process.env.ZENDESK_SUBDOMAIN + '.zendesk.com/api/v2/' + path;
    console.log('request to ' + urlReq);
    fetch(urlReq, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + new Buffer(process.env.ZENDESK_USERNAME + '/token:' + process.env.ZENDESK_API_KEY).toString('base64')
                    //             'Authorization': 'Basic ' + new Buffer(process.env.ZENDESK_USERNAME + ':' + process.env.ZENDESK_PASSWORD).toString('base64')
            },
            body: postData
        })
        .then(function(response) {
            if (response.status !== 200 && response.status !== 201) {
                console.log('* zendeskRequest 0 error: Status Code: ' + response.status);
                return response;
            }
            return response.text();
        })
        .then(function(body) {
            var parsedBody = '';
            try {
                parsedBody = JSON.parse(body);

            }
            catch (err) {
                logError('* zendeskRequest 1 error ' + JSON.stringify(err || '') + buildErrorMessage(method, path, postData, res, body));
                if (clbkFunc) clbkFunc(null);
                throw err;
            }
            if (parsedBody.error) {
                logError('* zendeskRequest 2 error ' + JSON.stringify(parsedBody) + buildErrorMessage(method, path, postData, res, body));
                if (clbkFunc) clbkFunc(null);
                throw new Error('zendeskRequest 2 error');
            }
            if (clbkFunc) clbkFunc(parsedBody);
        })
        .catch(function(err) {
            logError('* zendeskRequest 3 error ' + JSON.stringify(err || '') + buildErrorMessage(method, path, postData));
            debugger;
            if (clbkFunc) clbkFunc(null);
            throw err;
        });
}

function gRequest(method, path, postData, clbkFunc) {
    fetch('https://api.github.com/' + path, {
            method: method,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'ByteScout-Zendesk-To-Github-App',
                'Authorization': 'token ' + process.env.GITHUB_API_KEY
                    //             'Authorization': 'Basic ' + new Buffer(process.env.GITHUB_USERNAME + ':' + process.env.GITHUB_PASSWORD).toString('base64')
            },
            body: postData && JSON.stringify(postData)
        })
        .then(function(res) {
            if (res.status !== 200 && res.status !== 201) {
                console.log('* gRequest 0 error: Status Code: ' + res.status);
                debugger;
                return res;
            }
            else if (res && (res.status === 200 || res.status === 201)) { // OK or created
                // check if we have other pages referenced in "Link" header
                // because Github don't allow to sort by newest first and returns issues or comments 
                // starting from first ones to the very last in the end
                var linkHeader = res.headers.get('Link');
                if (linkHeader !== null && linkHeader)
                {
                    var ss = linkHeader.split(',');
                    debugger;
                    // if we have links to current and last pages, and it contains '/comments?...' or like this
                    if (ss && ss.length>1 && 
                        ss[ss.length-1].search(/\/comments/i)>-1 && 
                        (ss[ss.length-1].search("=\"next\"") > -1 || ss[ss.length-1].search("=\"last\"") > -1) 
                    )
                    {
                        console.log('Github: found last page: ' + ss[ss.length-1]);
                        // extract the url to the last or next page
                        var lastPageLink = ss[ss.length-1].replace(/<(.*)>.*/, '$1').trim();
                        // if we have link to the last page then we call recursive for last page
                        
                        if (lastPageLink && lastPageLink.length>1)
                        {
                            // get the relative path to the last page 
                            lastPageLink = lastPageLink.replace("https://api.github.com/", "");
                            // finally send a request to get it
                            console.log('Github: request last page: ' + lastPageLink);
                            return gRequest(method, lastPageLink, postData, clbkFunc);
                        }
                    }
                }
                return res.text();
            }
            else {
                debugger;
                logError('* githubRequest status' + res.statusCode + buildErrorMessage(method, path, postData, res, body));
                if (clbkFunc) clbkFunc(null);
            }
        })
        .then(function(body) {
            if (body) {
                var parsedBody = '';
                try {
                    parsedBody = JSON.parse(body);
                }
                catch (err) {
                    if (clbkFunc) clbkFunc(null);
                    throw new Error('gRequest parsedBody error');
                }
                if (clbkFunc) clbkFunc(parsedBody || body);
            }
            else {
                if (clbkFunc) clbkFunc(res.statusCode);
            }
        })
        .catch(function(err) {
            logError('* githubRequest ' + JSON.stringify(err || '') + buildErrorMessage(method, path, postData));
            if (clbkFunc) clbkFunc(null);
            throw err;
        });
}


// 1) GOAL: the function to update github issue with a last comment from reply in zendesk
//    INPUT: zendeskTicketId, githubIssueUrl, githubRepoName
function updateGithubIssue(zendeskTicketId, userInfo, githubIssueUrl, productName, githubRepoName, clbkFunc) {

    console.log('zendesk ticket start processing: ' + zendeskTicketId);

    // set default error
    global.status = 'updateGithubIssue running - OK';

    if (filterzendeskTicketId && ((zendeskTicketId + '') !== filterzendeskTicketId)) {
        console.log('DEV MODE FILTERING by ticket id ' + filterzendeskTicketId);
        console.log('DEV MODE FILTERING skipping ticket id ' + zendeskTicketId);
        return {
            status: global.status
        };
    }

    function githubRequest(a, b, c, d) {
        gRequest(a, 'repos/' + githubRepoName + '/' + b, c, d);
    }

    function githubSearch(a, b) {
        // https://developer.github.com/v3/search/#search-issues
        gRequest('GET', 'search/issues?q=' + a, '', b);
    }

    zendeskRequest('GET', 'tickets/' + zendeskTicketId + '.json', '', function(data) {
        if (data.error) {
            global.status = data.error;
            return data.error;
        }
        // title is the product selected + real title
        //var title = inputData.zendeskProductSelected + ' ' + data.ticket.subject;
        var title = productName + ' ' + data.ticket.subject;
        title = title.replace(/(\r\n|\n|\r)/gm,"");
        title = title.trim();
        
        // if empty then set it to zendesk ticket id
        if (title === "")
            title = zendeskTicketId + " ticket";

        debugger;
        // zendesk user id
        var zendeskTicketRequesterId = data.ticket.requester_id;
        
        // set sort_order=desc option to return array that starts with the newest comments https://developer.zendesk.com/rest_api/docs/core/ticket_comments
        zendeskRequest('GET', 'tickets/' + zendeskTicketId + '/comments.json?sort_order=desc', '', function(commentsData) {
            // 1.1 creates the string that contains the very last comment from zendesk
            //     ticket (by zendeskTicketId) + has links to attachments from zendesk comment if any

            debugger;
            
            var header = '';
            var ticketUrl = 'https://' + process.env.ZENDESK_SUBDOMAIN + '.zendesk.com/agent/tickets/' + zendeskTicketId;

            var comment = commentsData.comments[0]; // Newest comment is the first one because of desc sort order (for asc order use [commentsData.comments.length - 1])

            if (comment.via && comment.via.channel && comment.via.channel === 'api') {
                console.log('SKIPPING: the last comment is from BOT (via API) so skipping');
                return;
            }

            var body = comment.body;

            if (!comment.public) {
                body = '! **INTERNAL** NOTE WAS ADDED IN ZENDESK:\r\n\r\n' + body;
            }

            var links = [];
            if (comment.attachments.length) {
                comment.attachments.forEach(function(attachment) {
                    var url = attachment.content_url;
                    var ext = url.slice(-4);
                    var bang = ['.jpg', '.png', '.gif', 'jpeg', '.bmp'].indexOf(ext) === -1 ? '' : '!';
                    links.push('\r\n\r\n' + bang + '[' + url.split('=').pop() + '](' + url + ')');
                });
            }
            body += (links.length ? '\r\n\r\n**ATTACHMENTS:**\r\n\r\n' + links.join('') : '');

            // no githubUrl means it is the NEW issue!
            // creating new github issue!
            // and adding <zendeskTagToMarkNewTickets> tag in zendesk if this is the very first ticket from user
            if (!githubIssueUrl) { // 1.2 if githubIssueUrl is empty then creates github ticket in the githubRepoName
                
                // check if this we have 1 or more tickets from the user
                // if we have just the first one ticket from this user
                // then we should add tag "lead" to the zendesk ticket
                // otherwise NO labels (tags) apply
                zendeskRequest('GET', 'users/' + zendeskTicketRequesterId + '/tickets/requested.json', '', function(userTickets) {
                
                    var header = "";
                    
                    debugger;
                    var userHasPreviousTickets = (userTickets && userTickets.count > 1);
                    
                    // if user has previous zendesk tickets then add info about it
                    if (userHasPreviousTickets)
                    {
                        var firstTicket = userTickets.tickets[0];
                        header = "**" + userTickets.count + " PREV ZENDESK REQUESTS, FIRST AT " + firstTicket.updated_at + ": \"" + shorten(firstTicket.subject,7) + '\"**\r\n'
                    }
                
                    // creating new github issue
                    // https://developer.github.com/v3/issues/#create-an-issue
                    header = header + '\r\n' + 'VIEW IN ZENDESK: ' + ticketUrl + '\r\n';
    
                    // add subscription information with the link to dashboard
                    //header = header + '[' + userInfo.subscriptionInfo + '](' + userInfo.dashboard + ')\r\n';

                    header = header + 'FROM ' + userInfo.name + ' (' + userInfo.email + ')\r\n';
                    header = header + 'GITHUB RELATED REQUESTS: https://github.com/search?type=Issues&q=org%3A' + encodeURIComponent(process.env.GITHUB_ORGANIZATION) + '+' + encodeURIComponent(userInfo.email) + '\r\n';                    
                    header = header + '\r\n' + userInfo.info + '\r\n';
                    body = header + '\r\n\r\n' + body;
    
                    // labels for new github issue
                    var cLabels = process.env.GITHUB_DEFAULT_LABELS;
                    if (userInfo && userInfo.label)
                        cLabels += ',' + userInfo.label.trim();
    
                    var crmLabels = cLabels.split(',');
    
                    // remove all empty values 
                    crmLabels = crmLabels.filter(function(e) {
                        return e
                    });
    
                    // JUST in case: trim all labels now
                    // OTHERWISE IT WILL CAUSE 422 STATUS ERROR on POST to Github API
                    for (var i = 0; i < crmLabels.length; i++) {
                        crmLabels[i] = crmLabels[i].trim();
                    }
    
                    // as we need to create new ticket SO
                    // we collect all the previous comments 
                    var allComments = '';
                    // collect all the previous comments if more than 1 s
                    if (commentsData.comments.length > 1) {
                        commentsData.comments.forEach(function(comm) {
                            allComments = '\r\n\r\n**CREATED AT: ' + comm.created_at + '**\r\n\r\n' + comm.body + '\r\n' + allComments;
                        });
                        if (allComments.length > 0) {
                            body = body + '\r\n\r\n**PREVIOUS COMMENTS (newest first)**:\r\n' + allComments;
                        }
                    }
    
    
                    //githubRequest('POST', 'issues', { title: title, body: escapeHTML(body) }, function (issue) {
                    githubRequest('POST', 'issues', {
                        title: title,
                        labels: crmLabels,
                        assignee: process.env.GITHUB_DEFAULT_ASSIGNEE,
                        body: escapeHTML(body)
                    }, function(issue) {
                        var issueUrl = issue.url.replace('//api.', '//').replace('/repos/', '/');
                        console.log('new github issue posted ' + issueUrl);
                        // now we should put zendesk ticket to on hold
    
                        // check if we have non-empty tag (zendeskTagToMarkNewTickets variable) 
                        // to mark new tickets in Zendesk 
                        if(zendeskTagToMarkNewTickets && zendeskTagToMarkNewTickets.length>0)
                        {
                            // check if this we have 1 or more tickets from the user
                            // if we have just the first one ticket from this user
                            // then we should add tag "lead" to the zendesk ticket
                            // otherwise NO labels (tags) apply
                            //zendeskRequest('GET', 'users/' + zendeskTicketRequesterId + '/tickets/requested.json', '', function(userTickets) {
        
                                debugger;
                                var tags_array = [];
                                // if we have user tickets and we have zero or one ticket at least
                                //if (userTickets && userTickets.count <= 1)
                                if (userHasPreviousTickets)
                                    tags_array.push(zendeskTagToMarkNewTickets); // add <zendeskTagToMarkNewTickets> tag if we have just 1 ticket from this user
        
                                var zendeskTicketData = {
                                    ticket: {
                                        status: 'hold', // set to on hold
                                        // add comment that On Hold etc
                                        comment: {
                                            public: true,
                                            body: messageHelpers.zendeskOnHoldMessage //createComment(tags[process.env.ZENDESK_MACRO_PASSED_TO_DEVELOPERS], zendeskUserData)+ '\r\n\r\n' +  'VIEW YOUR DASHBOARD: ' + userObj.dashboard 
                                        },
                                        tags: tags_array,
        
                                        custom_fields: [{
                                            // update custom field in zendesk ticket with url to github issue
                                            id: process.env.ZENDESK_PRODUCT_FIELD_ID,
                                            value: issueUrl
                                        }, ]
                                    }
                                };
                                // finally update zendesk ticket too
                                zendeskRequest('PUT', 'tickets/' + zendeskTicketId + '.json', JSON.stringify(zendeskTicketData), data => {
                                    clbkFunc(null, {
                                        githubIssueUrl: issueUrl
                                    });
                                });
                            // }); // request zendesk/users/requesterid/tickets
                        }; // if zendeskTagToMarkNewTickets is not empty
                    });
                });
            }
            else { // else updating the existing github issue

                var issueNumber = githubIssueUrl.split('/issues/').pop();

                var header = '**VIEW IN ZENDESK**: ' + ticketUrl + '\r\n';
                // add subscription information with the link to dashboard
                //header = header + '[' + userInfo.subscriptionInfo + '](' + userInfo.dashboard + ')\r\n';
                if(userInfo){
                    header = header + '\r\n' +'FROM ' + userInfo.name + ' (' + userInfo.email + ')\r\n';
                    header = header + 'GITHUB RELATED REQUESTS: https://github.com/search?type=Issues&q=org%3A' + encodeURIComponent(process.env.GITHUB_ORGANIZATION) + '+' + encodeURIComponent(userInfo.email) + '\r\n';                                        
                    header = header + '\r\n' + userInfo.info + '\r\n';
                }
                header += '**UPDATE POSTED ON ' + comment.created_at + '**\r\n\r\n';

                body = header + body;

                githubRequest('GET', 'issues/' + issueNumber, '', function(issue) {
                    if (issue === 404) {
                        // 1.3 if githubIssueUrl is not empty but do not exist then runs the search along github organization
                        //     using the zendesk ticket url, and then uses the very last found github issue to reopen/add comment.
                        //     if not found then creates new github issue in githubRepoName
                        githubSearch(ticketUrl + '+type:issue+repo:' + githubRepoName + '&sort=created', function(data) {

                            if (data && data.items) {
                                if (data.items.length === 0) {

                                    // CREATING NEW GITHUB ISSUE
                                    // https://developer.github.com/v3/issues/#create-an-issue
                                    header = 'VIEW IN ZENDESK: ' + ticketUrl + '\r\n';
                                    //header = header + userInfo.subscriptionInfo + '\r\n';
                                    //header = header + userInfo.header + '\r\n';
                                    if (userInfo){
                                        header = header + '\r\n' + userInfo.info + '\r\n';
                                    }
                                    body = header + '\r\n\r\n' + body;

                                    // labels for github
                                    var cLabels = 'support';
                                    if (userInfo && userInfo.label)
                                        cLabels += ',' + userInfo.label;

                                    var crmLabels = cLabels.split(',');
                                    // remove all empty values 
                                    crmLabels = crmLabels.filter(function(e) {
                                        return e
                                    });

                                    // as we need to create new ticket SO
                                    // we collect all the previous comments 
                                    var allComments = '';
                                    // collect all the previous comments if more than 1 s
                                    if (commentsData.comments.length > 1) {
                                        commentsData.comments.forEach(function(comm) {
                                            allComments = '\r\n\r\n**CREATED AT: ' + comm.created_at + '**\r\n\r\n*' + comm.body + '*\r\n' + allComments
                                        });
                                        if (allComments.length > 0) {
                                            body = body + '\r\n\r\n**PREVIOUS COMMENTS (newest first)**:\r\n' + allComments;
                                        }
                                    }

                                    //githubRequest('POST', 'issues', { title: title, body: escapeHTML(body) }, function (issue) {
                                    githubRequest('POST', 'issues', {
                                        title: title,
                                        labels: crmLabels,
                                        assignee: process.env.GITHUB_DEFAULT_ASSIGNEE,
                                        body: escapeHTML(body)
                                    }, function(issue) {
                                        var issueUrl = issue.url.replace('//api.', '//').replace('/repos/', '/');
                                        console.log('new github issue posted ' + issueUrl);
                                        // now we should put zendesk ticket to on hold
                                        var zendeskTicketData = {
                                            ticket: {
                                                status: 'hold', // set to on hold


                                                // add comment if needs to
                                                comment: {
                                                    public: true,
                                                    body: messageHelpers.zendeskOnHoldMessage //createComment(tags[process.env.ZENDESK_MACRO_PASSED_TO_DEVELOPERS], zendeskUserData)+ '\r\n\r\n' +  'VIEW YOUR DASHBOARD: ' + userObj.dashboard 
                                                },

                                                custom_fields: [{
                                                    // update custom field with url to github
                                                    id: process.env.ZENDESK_PRODUCT_FIELD_ID,
                                                    value: issueUrl
                                                }, ]
                                            }
                                        };
                                        // finally update zendesk ticket too
                                        zendeskRequest('PUT', 'tickets/' + zendeskTicketId + '.json', JSON.stringify(zendeskTicketData), data => {
                                            clbkFunc(null, {
                                                githubIssueUrl: issueUrl
                                            });
                                        });
                                    });
                                }
                                else {
                                    // reopen the github issue first
                                    githubRequest('PATCH', 'issues/' + data.items[0].number, {
                                        state: 'open'
                                    }, function() {
                                        console.log('reopened github issue ' + data.items[0].number);
                                        // then post the comment as the update
                                        githubRequest('POST', 'issues/' + data.items[0].number + '/comments', {
                                            body: escapeHTML(body)
                                        }, function(issue) {
                                            var issueUrl = issue.url.replace('//api.', '//').replace('/repos/', '/');
                                            console.log('github issue ' + issueNumber + 'not found, but found the last one and updated: ' + data.items[0].number);

                                            // add zendesk comment data if needs to 
                                            var zendeskCommentData = null;
                                            // check if we need to post onHold messages receipts ALWAYS or not
                                            if (zendeskSendOnHoldMessageAlways) {
                                                // set comment content to the onHold message
                                                zendeskCommentData = {
                                                    public: true,
                                                    body: messageHelpers.zendeskOnHoldMessage //createComment(tags[process.env.ZENDESK_MACRO_PASSED_TO_DEVELOPERS], zendeskUserData)+ '\r\n\r\n' +  'VIEW YOUR DASHBOARD: ' + userObj.dashboard 
                                                };
                                            }

                                            var zendeskTicketData = {
                                                ticket: {
                                                    status: 'hold', // set to on hold

                                                    // comment data
                                                    comment: zendeskCommentData,

                                                    custom_fields: [{
                                                        // update custom field with url to github
                                                        id: process.env.ZENDESK_PRODUCT_FIELD_ID,
                                                        value: issueUrl
                                                    }, ]
                                                }
                                            };
                                            // finally update zendesk ticket too
                                            zendeskRequest('PUT', 'tickets/' + zendeskTicketId + '.json', JSON.stringify(zendeskTicketData), data => {
                                                clbkFunc(null, {
                                                    githubIssueUrl: issueUrl
                                                });
                                            });
                                        }); // posting the comment
                                    }); // open github issue
                                }
                            }
                        });
                    }
                    else {
                        // 1.4 if githubIssueUrl exists then the code opens this github issue and posts the string from 1.1 as a comment
                        githubRequest('PATCH', 'issues/' + issueNumber, {
                            state: 'open'
                        }, function(data) {
                            console.log('reopened github issue ' + issueNumber);

                            // then add the reply as a comment
                            githubRequest('POST', 'issues/' + issueNumber + '/comments', {
                                body: escapeHTML(body)
                            }, function(issue) {
                                console.log('existing github issue updated as comment ' + githubIssueUrl);
                                var issueUrl = issue.url.replace('//api.', '//').replace('/repos/', '/');

                                // add zendesk comment data if needs to 
                                var zendeskCommentData = null;
                                // check if we need to post onHold messages receipts ALWAYS or not
                                if (zendeskSendOnHoldMessageAlways) {
                                    // set the content of the ticket
                                    zendeskCommentData = {
                                        public: true,
                                        body: messageHelpers.zendeskOnHoldMessage //createComment(tags[process.env.ZENDESK_MACRO_PASSED_TO_DEVELOPERS], zendeskUserData)+ '\r\n\r\n' +  'VIEW YOUR DASHBOARD: ' + userObj.dashboard 
                                    };
                                }
                                // zendesk ticket update data 
                                var zendeskTicketData = {
                                    ticket: {
                                        status: 'hold', // set to on hold
                                        // add comment if needs to
                                        comment: zendeskCommentData,
                                    }
                                };
                                // put zendesk ticket to on hold
                                zendeskRequest('PUT', 'tickets/' + zendeskTicketId + '.json', JSON.stringify(zendeskTicketData), data => {
                                    clbkFunc(null, {
                                        githubIssueUrl: issueUrl
                                    });
                                });

                            });
                        }); // end of opening github issue

                    }

                });
            }


        });
    });

    //return {status: global.status};
    //callback(null, output);


}

// searches and extracts zendesk ticket url and ticket id from given string
function extractZendeskTicketInfo(body) {

    if(body==null || (body && body == ''))
        return null;

    try {
        
        // console.log('zendesk item body' + item.body);
        var reg = new RegExp('https\\:\\/\\/' + process.env.ZENDESK_SUBDOMAIN + '\\.zendesk\\.com\\S+', 'i');
        var matches = reg.exec(body);
        // console.log('matches: ' + matches);

        if (matches && matches.length > 0) {
            var zendeskTicketInfo = {
                Url: '',
                Id: ''
            };

            zendeskTicketInfo.Url = matches[0];
            console.log('Zendesk linked ticket found: ' + zendeskTicketInfo.Url);
            zendeskTicketInfo.Id = zendeskTicketInfo.Url.split('/').pop();
            return zendeskTicketInfo;

        }
        else
            return null;

    }
    catch (e) {
        throw e;
    }
}


// the function searches Github for the issue with the comment that contains the  "#tksolution"
// inside and posts this comment to the original zendesk ticket as a public comment
function githubToZendesk(githubRepoName, clbkFunc) {


    function githubRequest(a, b, c, d) {
        gRequest(a, 'repos/' + githubRepoName + '/' + b, c, d);
    }

    function githubSearch(a, b) {
        gRequest('GET', 'search/issues?q=' + a, '', b);
    }

    // 2.1  runs the search inside githubOrganizationUrl for the issue with the comment that contains the  "#tksolution"
    //      inside and posts this comment to the original zendesk ticket as a public comment

    var statesToSearch = ''; // by default will search in any github issues
    if (githubScanOpenTicketsForSolutionOnly)
        statesToSearch = '+state:open'; // adds search inside open issues in github only

    githubSearch(githubCommandWords.solution + '+type:issue+in:comments' + statesToSearch + '+repo:' + githubRepoName, function(data) {
        if (data && data.items) {
            if (data.items.length) {
                console.log('Found ' + data.items.length + ' issues with comments marked as solution by keyword:' + githubCommandWords.solution);

                var i = data.items.length;
                var updatedIssuesCounter = 0;
                (function loop() {
                    i--;
                    var item = data.items[i];

                    debugger;
                    if (item) {
                        // 2.2 if found then extracts url to zendesk ticket from this issue's description. The zendesk url is in the form
                        //     like this "http://zendeskSubdomain.zendesk.com/agent/ticket/12345". If zendeskurl not found then go to 2.1
                        //     for the next found result
                        var zendeskUrl = '';
                        var zendeskTicketId = '';

                        var zendeskUrlInfo = null;
                        
                        debugger;
                        
                        zendeskUrlInfo = extractZendeskTicketInfo(item.body);
                        
                        if (zendeskUrlInfo) {
                            zendeskUrl = zendeskUrlInfo.Url;
                            zendeskTicketId = zendeskUrlInfo.Id;
                        }


                        if (filterzendeskTicketId && ((zendeskTicketId + '') !== filterzendeskTicketId)) {
                            var stringError = 'FILTERED - SKIPPING: didnt find zendesk url in the comment ' + i + ' in issue #' + item.number;
                            console.log(stringError);

                            // reopen the github issue first
                            githubRequest('PATCH', 'issues/' + item.number, {
                                state: 'open'
                            }, function() {
                                console.log('reopened github issue ' + item.number);
                                // then post the error comment as the update
                                githubRequest('POST', 'issues/' + item.number + '/comments', {
                                    body: escapeHTML(stringError)
                                }, function(issue) {; // do nothing
                                }); // posting the comment
                            });

                            loop(); // continue to next one
                        }

                        if (!zendeskUrl) {
                            loop();
                        }
                        else {
                            // github will not return more than 100 per page anyway but we set it anyway
                            githubRequest('GET', 'issues/' + item.number + '/comments?per_page=100', '', function(comments) {
                                console.log('comments for github ticket ' + item.number + ' found: ' + comments.length);
                                
                                debugger;

                                // 2.3 takes the content of 2.2 comment and saves into CommentContent and replaces #solution to the empty text.
                                var arr = comments.filter(function(i) {
                                    return i.body.indexOf(githubCommandWords.solution) >= 0;
                                });
                                // 
                                
                                // we should NOT get zero comments filtered! 
                                // if so then should throw error
                                if (arr === null || arr.length == 0) 
                                {
                                    var msg = "Error and BREAKING: can't get the comment with " + githubCommandWords.solution + " from ticket #" + item.number;
                                    console.log(msg);
                                    new Error(msg);
                                    return;
                                }
                                
                                console.log('comments with "' + githubCommandWords.solution + '" keyword found: ' + arr.length);
                                
                                // NOW check if we can have the latest zendesk url (if it changed - though it is RARE case)
                                // BEGIN
                                // so we are searching for the latest zendesk ticket url in latest comments
                                // in case we have updated zendesk url
                                var arrCommentsWithZendeskUrl = comments.filter(function(i) {
                                    return i.body.indexOf('https://' + process.env.ZENDESK_SUBDOMAIN + '.zendesk.com/agent/tickets/') >= 0;
                                });

                                debugger;

                                // and check returned array of comments in search of later zendesk ticket url
                                if (arrCommentsWithZendeskUrl && arrCommentsWithZendeskUrl.length > 0) {
                                    // get the very last comment with zendesk url found inside
                                    var lastCommentBodyWithZendeskUrl = arrCommentsWithZendeskUrl.pop();

                                    // now try to extract zendesk ticket info from this comment
                                    var zendeskUrlInfo = extractZendeskTicketInfo(lastCommentBodyWithZendeskUrl.body);
                                    if (zendeskUrlInfo) {
                                        // finally update zendesk url and zendesk ticket id to the latest ones
                                        zendeskUrl = zendeskUrlInfo.Url;
                                        zendeskTicketId = zendeskUrlInfo.Id;
                                    }
                                }
                                // END of search for updated zendesk url

                                
                                var lastComment = arr.pop();
                                var CommentContent = lastComment.body.replace(githubCommandWords.solution, '').trim();

                                // 2.4 checks the CommentContent for #solved text, replaces it to empty text. if exsists then sets isSolved=true
                                var isSolved = false;
                                if (CommentContent.indexOf(githubCommandWords.solved) >= 0) {
                                    isSolved = true;
                                    // remove from the original content
                                    CommentContent = CommentContent.replace(githubCommandWords.solved, '').trim();
                                }


                                var isReopen = false;
                                // 2.5 checks the CommentContent for #reopen text, replaces it to empty text. if exsists then sets isReopen=true
                                if (CommentContent.indexOf(githubCommandWords.reopen) >= 0) {
                                    isReopen = true;
                                    // remove from the original content
                                    CommentContent = CommentContent.replace(githubCommandWords.reopen, '').trim();
                                }

                                // replace into links
                                CommentContent = autoTextReplacements.processReplacements(CommentContent);

                                // trim to see if there is a content to post
                                CommentContent = CommentContent.trim();

                                // should be min 2 length to be treated as the valid answer
                                var isDoPostToZendesk = CommentContent.length > 1;

                                if (isDoPostToZendesk) {
                                    // add greetings and footer to the ticket back
                                    CommentContent = messageHelpers.zendeskReplyHeader + CommentContent;

                                    // add footer if not solved yet
                                    if (!isSolved) {
                                        CommentContent = CommentContent + messageHelpers.zendeskReplyFooter;
                                    }
                                }
                                else {
                                    CommentContent = '';
                                }

                                // 2.6 connects to zendesk and posts CommentContent as a public reply to the zendeskUrl ticket
                                var putData = null;
                                if (isDoPostToZendesk) {
                                    putData = {
                                        ticket: {
                                            comment: {
                                                public: true,
                                                body: escapeHTML(CommentContent)

                                            }
                                        }
                                    };
                                }
                                else {
                                    putData = {
                                        ticket: {
                                            status: 'solved'
                                        }
                                    };
                                }

                                // 2.7 sets Zendesk ticket status to Pending if isSolved == false, or to Solved if isSolved == true
                                putData.ticket.status = (isSolved ? 'solved' : 'pending');

                                var zendeskTicketWasProcessed = false;

                                // post reply into zendesk
                                zendeskRequest('PUT', 'tickets/' + zendeskTicketId + '.json', JSON.stringify(putData), function(zResponse) {
                                    debugger;
                                    // in case of error we should reopen zendesk ticket
                                    if (zResponse == null) {
                                        var state = 'open';
                                        githubRequest('PATCH', 'issues/' + item.number, {
                                            state: state
                                        }, function() {
                                            console.log('ERROR posting to zendesk! reopening github issue ' + item.number + ' to state ' + state);
                                            //console.log(patchData);

                                            // increase updates issues counter
                                            updatedIssuesCounter++;
                                            zendeskTicketWasProcessed = false; // NOT processed
                                        });

                                        return; // return from processing

                                    }

                                    // add information for Github about the ticket
                                    if (isSolved) {
                                        CommentContent = 'WAS MARKED AS SOLVED\r\n\r\n' + CommentContent;
                                    }
                                    else {
                                        CommentContent = 'AND WAITING FOR USER REPLY IN ZENDESK\r\n\r\n' + CommentContent;
                                    }

                                    // 2.8 in github: changes the content of the ticket to "SENT TO ZENDESK {currentDateTime}" + CommentContent
                                    var patchData = {
                                        body: 'THE SOLUTION WAS SENT TO ZENDESK on ' + (new Date()) + '\r\n' + CommentContent
                                    };

                                    // finally CHANGE that comment in Github
                                    githubRequest('PATCH', 'issues/comments/' + lastComment.id, patchData, function() {

                                        // 2.9 if isReopen == false then closes the github issue, otherwise keeps it open
                                        var state = isReopen ? 'open' : 'closed';
                                        githubRequest('PATCH', 'issues/' + item.number, {
                                            state: state
                                        }, function() {
                                            console.log('updating github issue ' + item.number + ' to state ' + state + ' and comment ' + lastComment.id);
                                            //console.log(patchData);

                                            // increase updates issues counter
                                            updatedIssuesCounter++;
                                            zendeskTicketWasProcessed = true;

                                        });

                                    });
                                }); // zendeskRequest end

                                // 2.10 goes to 2.1 for next result (go to another github issue)
                                loop();
                            });
                        }
                    }
                    else {
                        var output = {
                            status: (i + ' github comments processed, no more more github comments found with ' + githubCommandWords.solution)
                        };
                        clbkFunc(null, output);
                    }
                }());
            }
            else {
                // as no items in the search data was found
                var output = {
                    status: 'no github comments found with ' + githubCommandWords.solution + ' (1)'
                };
                clbkFunc(null, output);
            }
        }
        else {
            // as no items in the search data was found
            var output = {
                status: 'no github issues found as ' + githubCommandWords.solution + ' (2)'
            };
            clbkFunc(null, output);
        }
    });
}

// KB ARTICLE ADDING: the function searches Github for the issue with the comment that contains the  "#tkarticle" inside
//  and posts this comment as Zendesk article in Knowledgebase
function githubToZendeskKnowledgebase(githubRepoName, clbkFunc) {


    function githubRequest(a, b, c, d) {
        gRequest(a, 'repos/' + githubRepoName + '/' + b, c, d);
    }

    function githubSearch(a, b) {
        gRequest('GET', 'search/issues?q=' + a, '', b);
    }

    // 2.1  runs the search inside githubOrganizationUrl for the issue with the comment that contains the  "#tksolution"
    //      inside and posts this comment to the original zendesk ticket as a public comment

    var statesToSearch = ''; // by default will search in any github issues
    if (githubScanOpenTicketsForSolutionOnly)
        statesToSearch = '+state:open'; // adds search inside open issues in github only

    githubSearch(githubCommandWords.addArticle + '+type:issue+in:comments' + statesToSearch + '+repo:' + githubRepoName, function(data) {
        if (data && data.items) {
            if (data.items.length) {
                console.log('Found ' + data.items.length + ' issues with comments marked as articles by keyword:' + githubCommandWords.addArticle);

                var i = data.items.length;
                var updatedIssuesCounter = 0;
                (function loop() {
                    i--;
                    var item = data.items[i];

                    debugger;
                    
                    if (item) {

                        githubRequest('GET', 'issues/' + item.number + '/comments?per_page=100', '', function(comments) {
                            console.log('comments for github ticket ' + item.number + ' found: ' + comments.length);

                            // 2.3 takes the content of 2.2 comment and saves into CommentContent and replaces #solution to the empty text.
                            var arr = comments.filter(function(i) {
                                return i.body.indexOf(githubCommandWords.addArticle) >= 0;
                            });
                            // 

                            console.log('comments with "' + githubCommandWords.addArticle  + '" found ' + arr.length);
                            
                            // we should NOT get zero comments filtered! 
                            // if so then should throw error
                            if (arr === null || arr.length == 0) 
                            {
                                var msg = "Error and BREAKING: can't get the comment with " + githubCommandWords.addArticle + " from ticket #" + item.number;
                                console.log(msg);
                                new Error(msg);
                                return;
                            }
                            
                            
                            // ! we will process the very last one per single github issue at time!
                            var lastComment = arr.pop();
                            var CommentContent = lastComment.body.replace(githubCommandWords.solution, '').trim();

                            // 2.4 checks the CommentContent for keywords text, replaces it to empty text. if exsists then sets isSolved=true
                            CommentContent = CommentContent.replace(githubCommandWords.addArticle, '').trim();

                            var isReopen = false;
                            // 2.5 checks the CommentContent for $reopen text, replaces it to empty text. if exsists then sets isReopen=true
                            if (CommentContent.indexOf(githubCommandWords.reopen) >= 0) {
                                isReopen = true;
                                // remove from the original content
                                CommentContent = CommentContent.replace(githubCommandWords.reopen, '').trim();
                            }

                            // replace into links
                            CommentContent = autoTextReplacements.processReplacements(CommentContent);

                            // trim to see if there is a content to post
                            CommentContent = CommentContent.trim();

                            // should be min 2 length to be treated as the valid answer
                            var isDoPostToZendesk = CommentContent.length > 1;

                            if (isDoPostToZendesk) {
                                ; // 
                            }
                            else {
                                CommentContent = '';
                            }

                            // create new KB article if need to
                            if (CommentContent.length > 0) {

                                var kbData = null;

                                kbData = {
                                    article: {
                                        title: shorten(escapeHTML(CommentContent), 12), // set title based on article text limited to 12 words
                                        body: escapeHTML(CommentContent),
                                        locale: "en-us"
                                    }
                                };

                                // finally post to create new article
                                zendeskRequest('POST', 'help_center/sections/' + process.env.ZENDESK_KB_SECTION_ID + '/articles.json', JSON.stringify(kbData), function(data) {
                                    
                                    var articleUrl = 'https://' + process.env.ZENDESK_SUBDOMAIN + '.zendesk.com/hc/en-us/articles/' + data.article.id;
                                    
                                    console.log('ZENDESK KB article was published: ' + articleUrl);
                                    
                                    var commentText = 'POSTED AS ZENDESK KB ARTICLE\r\n' + articleUrl + '\r\n' + CommentContent;
                                    // post comment with a link to new KB article
                                    //  CHANGE that comment in Github
                                    githubRequest('PATCH', 'issues/comments/' + lastComment.id, {
                                        body: escapeHTML(commentText)
                                    }, function() {
                                        // reopen Github issue if had $reopen keyword!                            
                                        if (isReopen)
                                        {
                                            var state = 'open';
                                            githubRequest('PATCH', 'issues/' + item.number, {
                                                state: state
                                            }, function() {
                                                console.log('reopening github issue ' + item.number + ' to state ' + state + ' and comment ' + lastComment.id);
                                                //console.log(patchData);
                                                // increase updates issues counter
                                                updatedIssuesCounter++;
                                            });
                                        }
                                    });
                                });
                            }; // creating new zendesk KB article

                            // 2.10 goes to 2.1 for next result (go to another github issue)
                            loop();
                        });
                    }
                    else {
                        var output = {
                            status: (i + ' github comments processed, no more more github comments found with ' + githubCommandWords.addArticle)
                        };
                        clbkFunc(null, output);
                    }
                }());
            }
            else {
                // as no items in the search data was found
                var output = {
                    status: 'no github comments found with ' + githubCommandWords.addArticle + ' (1)'
                };
                clbkFunc(null, output);
            }
        }
        else {
            // as no items in the search data was found
            var output = {
                status: 'no github issues found as ' + githubCommandWords.addArticle + ' (2)'
            };
            clbkFunc(null, output);
        }
    });
}



// 3) copy issues between github repos
function githubCopyIssue(githubRepoName, githubOrg, clbkFunc) {


    function githubRequest(a, b, c, d) {
        gRequest(a, 'repos/' + githubRepoName + '/' + b, c, d);
    }

    function githubRequestRepo(a, r, b, c, d) {
        gRequest(a, 'repos/' + r + '/' + b, c, d);
    }

    function githubSearch(a, b) {
        gRequest('GET', 'search/issues?q=' + a, '', b);
    }

    // 2.1  runs the search inside githubOrganizationUrl for the issue with the comment that contains the  "#solution"
    //      inside and posts this comment to the original zendesk ticket as a public comment

    // will search for open issues only
    //var statesToSearch = '+state:open'; // adds search inside open issues in github only
    var statesToSearch = ''; // search for both closed and open issues

    githubSearch(githubCommandWords.copyIssue + '+type:issue+in:comments' + statesToSearch + '+repo:' + githubRepoName, function(data) {
        if (data && data.items) {
            if (data.items.length) {
                console.log('Found ' + data.items.length + ' issues with comments marked with copy command by keyword:' + githubCommandWords.copyIssue);
                var i = data.items.length;
                var updatedIssuesCounter = 0;
                (function loop() {
                    i--;
                    var item = data.items[i];

                    if (item) {
                        githubRequest('GET', 'issues/' + item.number + '/comments?per_page=100', '', function(comments) {

                            // collect all comments
                            var allCommentsContent = '';

                            // first collect all comments content from the original ticket
                            // and save the very last one
                            var lastComment = null;

                            comments.forEach(function(i, idx, array) {
                                if (idx === array.length - 1) {
                                    lastComment = i;
                                }
                                else {
                                    allCommentsContent += '**' + i.updated_at + '**' + '\r\n\r\n' + i.body + '\r\n\r\n'; // collect all comments into the variabl
                                }
                            });

                            // preadd body from the original item
                            allCommentsContent = '**ORIGINAL ISSUE: ' + item.html_url + '**\r\n\r\n' + item.body + '\r\n\r\n' + allCommentsContent.trim();
                            // trim again
                            allCommentsContent = allCommentsContent.trim();

                            /*
                            // filter new repo name from comment
                            var arr = comments.filter(function (i) {
                                return i.body.indexOf(githubCommandWords.copyIssue) >= 0;
                            });       

                            // find the comment with githubCommandWords.copyIssue command
                            var lastComment = arr.pop();

                            */

                            var newRepoName = lastComment.body.split(githubCommandWords.copyIssue).pop();
                            newRepoName = newRepoName.trim();
                            // replace all \ (if any) to / symbol
                            newRepoName = newRepoName.replace('\\', '/');
                            // if does not come in form like orgname/reponame 
                            // then add one
                            if (!newRepoName.includes('/'))
                                newRepoName = githubOrg + '/' + newRepoName;


                            // remove the command from the last comment content
                            var CommentContent = lastComment.body.replace(githubCommandWords.copyIssue, '').trim();

                            /*
                                // 2.4 checks the CommentContent for #solved text, replaces it to empty text. if exsists then sets isSolved=true
                                var isSolved = false;
                              	if (CommentContent.indexOf(githubCommandWords.solved) >= 0) {
                                    isSolved = true;
                                    // remove from the original content
                                    CommentContent = CommentContent.replace(githubCommandWords.solved, '').trim();
                                }
                                
                                
                                var isReopen = false;
                                // 2.5 checks the CommentContent for #reopen text, replaces it to empty text. if exsists then sets isReopen=true
                                if (CommentContent.indexOf(githubCommandWords.reopen) >= 0) {
                                    isReopen = true;
                                    // remove from the original content
                                    CommentContent = CommentContent.replace(githubCommandWords.reopen, '').trim();
                                }
                                */

                            // trim to see if there is a content to post
                            CommentContent = CommentContent.trim();

                            var title = '[COPY] ' + item.title;

                            // now try to post new issues to newRepoName
                            githubRequestRepo('POST', newRepoName, 'issues', {
                                title: title,
                                body: escapeHTML(allCommentsContent)
                            }, function(issue) {

                                if (issue) {

                                    // get url to newly posted issue
                                    var issueUrl = issue.html_url
                                    console.log('new github issue posted ' + issueUrl);
                                    // now we should put zendesk ticket to on hold

                                    CommentContent = '**THIS ISSUE WAS COPIED TO ' + issueUrl + ' on ' + (new Date()) + '**' + '\r\n' +
                                        '@' + lastComment.user.login; // mention for last comment user
                                }
                                else {
                                    CommentContent = '**ERROR** - cant find or make copy to **https://github.com/' + newRepoName + '**!  ' + (new Date()) + '\r\n' +
                                        '@' + lastComment.user.login; // mention for last comment user

                                }

                                // 2.8 in github: changes the content of the ticket to "SENT TO ZENDESK {currentDateTime}" + CommentContent
                                var patchData = {
                                    body: CommentContent
                                };

                                // finally PATCH that original  comment with command in Github
                                githubRequest('PATCH', 'issues/comments/' + lastComment.id, patchData, function() {

                                    // make sure to reopen the original inbox issue!
                                    //var state = isReopen ? 'open' : 'closed';
                                    var state = 'open';
                                    githubRequest('PATCH', 'issues/' + item.number, {
                                        state: state
                                    }, function() {
                                        console.log('updating github issue ' + item.number + ' to state ' + state + ' and comment ' + lastComment.id);
                                        //console.log(patchData);

                                        // increase updates issues counter
                                        updatedIssuesCounter++;

                                    });

                                });


                            });

                            // 2.10 goes to 2.1 for next result (another github issue)
                            loop();
                        });
                    }
                    else {
                        var output = {
                            status: (i + ' github comments processed, no more more github comments found with ' + githubCommandWords.copyIssue + ' command')
                        };
                        clbkFunc(null, output);
                    }
                }());
            }
            else {
                // as no items in the search data was found
                var output = {
                    status: 'no github comments found with ' + githubCommandWords.copyIssue + ' command (1)'
                };
                clbkFunc(null, output);
            }
        }
        else {
            // as no items in the search data was found
            var output = {
                status: 'no github issues found with ' + githubCommandWords.copyIssue + ' command (2)'
            };
            clbkFunc(null, output);
        }
    });
}
