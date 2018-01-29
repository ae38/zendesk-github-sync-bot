# 2-WAY ZENDESK + GITHUB BOT THAT CAN RUN FOR FREE

*brought to you by [ByteScout](https://bytescout.com)*

## IMPORTANT - PLEASE READ FIRST

Though this bot is battle tested during last 12 months in production mode but there are no any guarantees or warranties for this bot. 
**ByteScout is not responsible for anything done with this bot. 
You use it at your own risk. There are no warranties or guarantees expressed or implied. 
You assume all responsibility and liability.**


## What is it for?

This little node.js bot is able to perform 2-way sync between Zendesk and Github. The app connects and syncs best of two worlds: Zendesk (best customer support platform) and Github (best git based project management platform).

## Who should use it?

Technical support teams that you don't want to spend time jumping between Zendesk and Github. 

## How it works?

This little bot can run in **4** modes:

- **Zendesk to Github sync**: finds open and re-opened tickets in Zendesk, posts them as new issues in Github (or adds as comment to existing issue), then puts Zendesk ticket to `On Hold` status. 
- **Github to Zendesk sync**: finds every comment that mentions the special keyword `tksolution`, finds related Zendesk ticket and posts the comment as a reply to Zendesk ticket, closes the original Github issue or keeps it opened if it contains `$reopen` keyword. 
- **Github Copy Issue**: finds every comment with `tkcopy <newrepo>` phrase and copies the whole issue with all comments into new repo. It is useful if you need to copy the complete issue into another repo as for some reason Github is not able to do this.
- **Add Github comment as Zendesk Article**: finds every comment with `tkadd` keyword, takes this comment and adds its content as new article in Zendesk Knowledgebase. Why you need this: your engineer can describe the solution and can publish right from Github. Content Editor can later edit the article in Zendesk.


## Features

- Takes open tickets from Zendesk and copies them into "inbox" Github repository. It will take all replies/comments from Zendesk if any or just last reply/comment from customer if zendesk ticket is already logged in Github.
- Links to attachments from Zendesk are also listed at the bottom of Github comment, images are included as inline images in Github comment.
- Takes comments marked with special keywords in Github and posts them as replies into related Zendesk tickets. You may use `$reopen` keyword to reopen Github issue after syncing with Zendesk or mark Zendesk ticket as resolved (using `$resolved` keyword)
- Takes comments marked with special keyword `tkadd` and publishing this comment as a new article in Zendesk Knowldegbase 
- Can optionally fetch information from 3rd party CRM or service about customer and add it when syncing Zendesk into Github ticket. For example, it can be information about currently active subscriptions or information from email marketing service.
- Can do auto-replace of predefined keywords. For example, if you need to provide link to your product web page.
- Supports Markdown (you should enable Markdown in Zendesk too).
- Best of all it can run for free on Heroku! You may deploy it to free plan on Heroku, setup Heroku Cron Scheduler to perform calls every 10 minutes and as it works fast so Free plan will be enough.

## Usage

use `tksolution` in github comment and this comment from github will be:

- the bot will search for comments with `tksolution` word and will work with this github issue
- the bot will search in comments in this github issue for the url of related zendesk ticket
- the bot will post this comment as a reply in connected zendesk ticket, zendesk ticket will be set to `On Hold` status
- the comment in github will be patched to remove `tksolution` word from it
- and then this github issue will be closed 

For example (comment in github issue):
```
tksolution
Hey, just try to logout from the bot and then login again. And this button will work!
```

Add `$reopen` word to automatically reopen this github issue after replying in zendesk. This is useful if you want to work on this issue further to update user later

For example (comment in github issue):
```
tksolution
We are working on it and will update you soon with the patch! Thanks for patience
```

Add `$solved` word to mark zendesk ticket as `Solved`

For example (comment in github issue):
```
tksolution $solved
We finally fixed this issue! New version is available and you may try it now. 
```

**Adding articles to Zendesk helpdesk**

Write separate comment with `tkadd` word to also post this comment as public article in Zendesk knowledgebase in help section defined ZENDESK_KB_SECTION_ID variable in ENV

For example (publish comment as article in zendesk KB):
```
tkadd
If you experience error with hanging SuperApp then make sure you have upgraded to the 2.00 or the latest version from our website.
```

For example (create KB article in zendesk from github comment and reopen):
```
tkadd $reopen
If you experience error with hanging SuperApp then make sure you have upgraded to the 2.00 or the latest version from our website.
```

COPYING ISSUES INSIDE GITHUB

The bot scans for `tkcopy newrepo` command and then is doing the following:
- copies this issue in github into `newrepo`
- posts link to the new issue in the commend in the current repo so both issues are associated with each other

Add `tkcopy reponame` in a comment.

Example (in github issue)
```
tkcopy project2
Need to check this ticket!
```

## PREPARATION

- copy `.env.sample` into `.env` file and edit it values
- Zendesk: create a **hidden** custom text field in Zendesk that will store the link to related Github issue. When Zendesk ticket is copied into Github then the bot will also store URL to Github issue in that field. You will need to set ID of this field in `.env`
- Zendesk: optionally create a public custom text field in Zendesk that will allow use to select the product or service name. The bot will read its value from Zendesk and will copy to Github so it will be clear what is the related service/product name. You will need to set ID of this field in `.env`
- Zendesk: get API key value to access tickets
- Zendesk - to enable testing mode: create one Zendesk ticket for testing purposes and get its ID. Set this ID to `TESTING_ZENDESK_TICKET_ID` so the bot will work with this ticket only and will skip all other tickets.
- Github: create separate repository called `inbox`.
- Github: create separate user with access to this repository only. 
- Github: get API key for this new user so the bot will use it to access this `inbox` repo
- Fill in values in the `.env` file:

```
# zendesk api key that allows to access zendesk API
ZENDESK_API_KEY=sometoken
# zendesk subdomain (mycompany from mycompany.zendesk.com), for example: "mycompany"
ZENDESK_SUBDOMAIN=domain
# email of the zendesk user to post as, for example, "myemail@domain.com" (without quotes)
ZENDESK_USERNAME=email
# github api key token. For security reasonse it is better to create a separate user with access to this "inbox" repo only.
GITHUB_API_KEY=githubapikey
# url to CRM to query info about users from
CRM_QUERY_URL=urltorequestfromcrm
# id of the custom text field that stores product name, for exampl 1234567
ZENDESK_PRODUCT_FIELD_ID=idofthefield
# id of the custom text field that used to store github url, for example 123456
ZENDESK_GITHUB_URL_FIELD_ID=idofthefield
# incoming repo to create issues in, for example "myorg/inbox" (without quotes)
GITHUB_REPO_NAME_INCOMING=incomingrepo
# outgoing repo where the bot scans for solution, for example "myorg/inbox" (without quotes)
GITHUB_REPO_NAME_OUTGOING=incomingrepo
# username of default assigne for new github issues in github, for example dev1
GITHUB_DEFAULT_ASSIGNEE=defaultgithubassigne
# default labels for new issues in github (label(s) should exist in that repo!), for example "support,incoming"
GITHUB_DEFAULT_LABELS=defaultlabels
# organization name, for example, "myorg"
GITHUB_ORGANIZATION=myorg
# to enable testing with just one selected ticket, set this to this zendesk ticket ID. For example, 12345454
TESTING_ZENDESK_TICKET_ID=
```
- try to run locally 
- create new bot on herok and deploy to heroku
- try to reopen ticket in zendesk, try to send reply from Github
- configure the Heroku Scheduler to call your bot in every mode every 10/20/60 minutes (it is up you to set the frequency of syncing)
- confirm that all works OK
- set `TESTING_ZENDESK_TICKET_ID` to empty value and redeploy the bot to run in `production` mode that will work with all Zendesk tickets now.


## RUNNING THE BOT ON HEROKU:

Create node.js bot in Heroku
Add free Scheduler addon
Open Scheduler addon settings
Add the following commands to run every 15 minutes:

1. Create/update github issues from Zendesk new and re-opened tickets:

`worker --step zendesk-github` 

you may run local version with: `node sync.js --step zendesk-github`) 

2. Publish github comments marked with `tksolution` as replies to zendesk tickets:

`worker --step github-zendesk` 

you may run manually on local machine: `node sync.js --step github-zendesk`

3. Publish github comment marked with `tkarticle` as public articles in Zendesk Knowledgebase:

`worker --step github-zendesk-kb`

you may run manually on the local machine: `node sync.js --step github-zendesk-kb`

4. Copy github issue containing comment `tkcopy` from the current repo to another given repo 

`worker --step github-copy`

you may run manually on the local machine: `node sync.js --step github-copy`

## LICENSE

MIT

## SHAMLESS PLUG

**Are you looking for data extraction, barcode reading and barcode generation, pdf, e-sign and other APIs and on-premise components? 
Check [ByteScout.com](https://bytescout.com) now!**

