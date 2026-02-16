/**
 * Google Apps Script web app that creates a Gmail filter for Daily Gist.
 *
 * Deploy as: Web app → Execute as "User accessing the web app"
 * Requires: Gmail Advanced Service enabled (Services → Gmail API)
 *
 * Query params:
 *   forwarding_address — user's @dailygist.fyi address
 *   sender_emails      — comma-separated newsletter sender emails
 *   label_name         — label to apply (default: "Daily Gist")
 *   return_url         — URL to redirect back to after completion
 */

function doGet(e) {
  var forwardingAddress = (e.parameter.forwarding_address || "").trim();
  var senderEmails = (e.parameter.sender_emails || "").trim();
  var labelName = (e.parameter.label_name || "Daily Gist").trim();
  var returnUrl = (e.parameter.return_url || "").trim();

  if (!forwardingAddress || !senderEmails) {
    return HtmlService.createHtmlOutput(
      "<h2>Missing parameters</h2><p>forwarding_address and sender_emails are required.</p>"
    );
  }

  try {
    var labelId = ensureLabel_(labelName);
    var senderList = senderEmails.split(",").map(function (s) {
      return s.trim();
    }).filter(Boolean);
    var query = "from:(" + senderList.join(" OR ") + ")";

    removeExistingFilter_(forwardingAddress);

    Gmail.Users.Settings.Filters.create(
      {
        criteria: { query: query },
        action: {
          addLabelIds: [labelId],
          removeLabelIds: ["INBOX"],
          forward: forwardingAddress,
        },
      },
      "me"
    );

    if (returnUrl) {
      return HtmlService.createHtmlOutput(
        "<html><body><script>window.top.location.href = " +
          JSON.stringify(returnUrl) +
          ";</script><p>Filter created! Redirecting...</p></body></html>"
      );
    }

    return HtmlService.createHtmlOutput(
      "<h2>Done!</h2><p>Gmail filter created. You can close this tab.</p>"
    );
  } catch (err) {
    return HtmlService.createHtmlOutput(
      "<h2>Error</h2><p>" + err.message + "</p>" +
      "<p>Make sure the Gmail Advanced Service is enabled and you have granted the required permissions.</p>"
    );
  }
}

/**
 * Ensure a Gmail label exists, creating it if necessary.
 * Returns the label ID.
 */
function ensureLabel_(name) {
  var labels = Gmail.Users.Labels.list("me").labels || [];
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].name === name) {
      return labels[i].id;
    }
  }

  var created = Gmail.Users.Labels.create(
    {
      name: name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
    "me"
  );
  return created.id;
}

/**
 * Remove any existing filter that forwards to the given address.
 * Gmail API doesn't support filter updates, so we delete + recreate.
 */
function removeExistingFilter_(forwardingAddress) {
  var filters = Gmail.Users.Settings.Filters.list("me").filter || [];
  for (var i = 0; i < filters.length; i++) {
    var action = filters[i].action || {};
    if (action.forward === forwardingAddress) {
      Gmail.Users.Settings.Filters.remove("me", filters[i].id);
    }
  }
}
