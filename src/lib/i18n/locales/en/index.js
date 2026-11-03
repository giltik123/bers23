// English reference pack — the source of truth for all keys.
// Organized by module; export each module for professional-translator handoff.
import common from './common';
import editor from './editor';
import projects from './projects';
import recipes from './recipes';
import workspace from './workspace';
import automation from './automation';
import fashion from './fashion';
import billing from './billing';
import settings from './settings';
import errors from './errors';
import notifications from './notifications';
import jobs from './jobs';
import creative from './creative';
import brand from './brand';
import assets from './assets';

export const modules = { common, editor, projects, recipes, workspace, automation, fashion, billing, settings, errors, notifications, jobs, creative, brand, assets,
  notFoundUi: { title: 'Page not found', hint: 'This address does not match a BERS page. Your projects and edits have not been changed.', backToProjects: 'Go to projects' },
  authUi: {
    "brand": "Creative studio",
    "workspace": "Your creative workspace",
    "hero": "Make more from every image.",
    "heroHint": "Create projects, choose a focused edit and preview changes before you save. A more understandable way to work with your photos.",
    "upload": "Upload a photo",
    "uploadHint": "Your image stays at the center of the workspace.",
    "choose": "Choose an edit",
    "chooseHint": "Tools appear when they are relevant.",
    "review": "Review and save",
    "reviewHint": "Keep a result only when it looks right.",
    "welcome": "Welcome back",
    "loginHint": "Log in to your account",
    "noAccount": "Don't have an account?",
    "createOne": "Create one",
    "continueGoogle": "Continue with Google",
    "or": "or",
    "email": "Email",
    "emailAddress": "Email address",
    "password": "Password",
    "forgot": "Forgot password?",
    "loggingIn": "Logging in...",
    "login": "Log in",
    "invalidLogin": "Invalid email or password",
    "createAccount": "Create your account", "registerSubmit": "Create account",
    "signupHint": "Sign up to get started",
    "hasAccount": "Already have an account?",
    "confirmPassword": "Confirm password",
    "passwordMismatch": "Passwords do not match",
    "registrationFailed": "Registration failed",
    "creatingAccount": "Creating account...",
    "verifyEmail": "Verify your email",
    "sentCode": "We sent a code to {email}",
    "verifying": "Verifying...",
    "verify": "Verify",
    "invalidCode": "Invalid verification code",
    "resendPrompt": "Didn't receive the code?",
    "resend": "Resend",
    "codeSent": "Code sent",
    "codeSentHint": "If this registration attempt is still valid, check your email for the new code.",
    "resendFailed": "Failed to resend code",
    "resetTitle": "Reset password",
    "resetHint": "We'll send you a link to reset it",
    "backToLogin": "Back to log in",
    "resetSent": "If an account exists with that email, you'll receive a password reset link shortly.",
    "sending": "Sending...",
    "sendReset": "Send reset link",
    "newPassword": "New password",
    "newPasswordHint": "Enter your new password below",
    "resetting": "Resetting...",
    "resetFailed": "Failed to reset password",
    "invalidLink": "Invalid reset link",
    "invalidLinkHint": "This password reset link is missing or invalid",
    "requestNewLink": "Request a new link",
    "invalidLinkHelp": "The link you used appears to be incomplete. Please request a new password reset email."
  },
  projectUi: {
    "workspace": "Your workspace",
    "intro": "Your photos and edits live here. Choose an existing project or start with a new image.",
    "startEditing": "Start editing",
    "createSomething": "CREATE SOMETHING",
    "hero": "Bring your next photo to life.",
    "heroHint": "Open a photo, make a focused change, compare the preview and save only when it looks right.",
    "creating": "Creating project…",
    "newProject": "New project",
    "stepUpload": "Upload photo",
    "stepEdit": "Choose an edit",
    "stepSave": "Preview & save",
    "projectLibrary": "Your projects",
    "libraryHint": "Find a photo and continue where you left off.",
    "shown": "{count} shown",
    "loading": "Loading projects",
    "archivedEmpty": "No archived projects found",
    "matchingEmpty": "No matching projects",
    "trySearch": "Try another search or switch back to active projects.",
    "addFirst": "Add your first photo",
    "firstHint": "Choose an image from your device to start editing. Your projects will appear here.",
    "retryQueued": "Queued to retry while this tab remains open. If you reload or close it, choose the file again.",
    "createFailed": "Unable to create this project.",
    "listFailed": "Unable to load projects.",
    "renameTitle": "Rename project",
    "renameFailed": "Unable to rename project.",
    "favoriteFailed": "Unable to update favorite.",
    "archiveFailed": "Unable to update archive state.",
    "deleteFailed": "Unable to delete project.",
    "fileInput": "Choose a photo for a new project",
    "searchRegion": "Find projects",
    "searchYour": "Search your projects",
    "search": "Search projects",
    "searchPlaceholder": "Project name…",
    "sortBy": "Sort by",
    "sort": "Sort projects",
    "archived": "View archived",
    "active": "View active",
    "unavailable": "Preview unavailable",
    "openEditor": "Open editor",
    "removeFavorite": "Remove from favorites",
    "addFavorite": "Add to favorites",
    "saved": "Saved",
    "favorite": "Favorite",
    "options": "Project options",
    "optionsLabel": "Options",
    "rename": "Rename",
    "unfavorite": "Unfavorite",
    "restore": "Restore",
    "archive": "Archive",
    "delete": "Delete",
    "sortRecent": "Last edited", "sortCreated": "Newest", "sortName": "Name A–Z", "sortEdits": "Most edits",
    "recent": "Recently updated",
    "name": "Name",
    "oldest": "Oldest"
  },
  navUi: {
    "projects": "Projects",
    "brand": "Creative studio",
    "home": "BERS — Projects",
    "main": "Main navigation",
    "account": "Account and preferences",
    "mobile": "Mobile navigation",
    "preferences": "Preferences and notifications",
    "closeMenu": "Close navigation menu",
    "openMenu": "Open navigation menu",
    "toLight": "Switch to light appearance", "toDark": "Switch to dark appearance", "unreadCount": "{count} unread", "close": "Close",
    "menu": "Menu"
  },
  editorUi: {
  "modes": "Editing modes",
  "methods": "Editing methods",
  "what": "What would you like to do?",
  "chooseMethod": "Choose editing method",
  "tabs": {
    "ai": {
      "label": "AI Studio",
      "description": "Build a bounded text plan, choose an actual Core mask and confirm the edit before execution."
    },
    "local": {
      "label": "Local tools",
      "description": "No AI, no credits: tune light, color and detail in your browser, compare before/after and download a PNG."
    },
    "prompt": {
      "label": "Prompt",
      "description": "Describe what you want to change, preview the result, then decide whether to save it."
    },
    "creative": {
      "label": "Creative Studio",
      "description": "Explore visual ideas and mood boards. This section plans ideas; it does not edit your photo."
    },
    "recipes": {
      "label": "Recipes",
      "description": "Choose a ready-made editing recipe and adapt it to your image."
    },
    "agent": {
      "label": "AI Agent",
      "description": "Build a controlled sequence of editing steps and review the result."
    },
    "fashion": {
      "label": "Fashion",
      "description": "Organize garments and wardrobe assets."
    },
    "outfits": {
      "label": "Outfits",
      "description": "Arrange outfits and explore available try-on operations."
    }
  },
  "allProjects": "All projects",
  "rename": "Rename",
  "editorHint": "Photo editor · changes are saved only after you accept a preview",
  "imageTitle": "Your image",
  "imageHint": "Select an object on the photo, or use a tool to edit the whole image.",
  "tools": "Tools",
  "chooseEdit": "Choose an edit",
  "toolsHint": "Crop, resize or select a part of the image. Each edit can be previewed before saving.",
  "rotateFlip": "Rotate or flip",
  "masks": "Masks & objects",
  "noObjects": "Edit the whole image or use the selection tool to mark a region. Automatic object detection is not available in this version.",
  "cropActive": "Adjust the crop rectangle above, then apply or cancel it before starting another edit.",
  "resizeActive": "Set the exact resize dimensions above, then apply or cancel them before starting another edit.",
  "loadingPanel": "Loading panel…",
  "moreTools": "More tools and activity",
  "workspace": "Workspace",
  "jobCenter": "Job Center",
  "sceneMemory": "Scene Memory",
  "recipe": "Recipe:",
  "recipeHint": "— edit the prompt below if needed.",
  "promptVersion": "Version name",
  "defaultVersion": "Version {count}",
  "notFound": "Project not found",
  "download": "Download",
  "viewImage": "View image"
},
  editorAi: {
    "headings": {
      "wholeImage": "BERS · Photo editing",
      "commandEditor": "BERS · Command editor"
    },
    "sections": {
      "wholeImage": "Generative photo editing",
      "commandEditor": "AI-first command editor",
      "adjustableParameters": "Adjustable command parameters",
      "examples": "Example commands",
      "regionAndMask": "Region and mask"
    },
    "fields": {
      "command": "What would you like to change in the photo?",
      "generationScope": "Which pixels may change?"
    },
    "placeholders": {
      "wholeImage": "For example: make the lighting warmer across the entire photo",
      "masked": "For example: slightly brighten the jacket, preserve its texture and leave the face unchanged"
    },
    "descriptions": {
      "wholeImage": "Describe a change to the entire frame. Review the result before saving.",
      "wholeImageScope": "Generative editing affects the entire frame. It is free within the server-side limit; no subscription is required. Compare the result with the original before saving.",
      "commandEditor": "Describe what you want to change, then confirm the region and effect strength. This is a controlled route to Core, not blind generation.",
      "fashion": "Realistic clothing try-on is not a simple overlay. It needs a real garment photo, fit to the body, contour and foreground occlusion (hands and hair).",
      "generative": "This requires a real generation model admitted by Core, not a simulation. The existing Creative Edit may be unavailable if no provider is configured.",
      "maskGuarantee": "The mask is sent to Core, but preservation outside the mask must be checked in the before/after images. This screen does not guarantee pixel-level behavior from the provider."
    },
    "labels": {
      "exposure": "Exposure",
      "temperature": "Temperature",
      "tint": "Tint",
      "inputBlack": "Input black point",
      "inputMidpoint": "Midtones",
      "inputWhite": "Input white point",
      "outputBlack": "Output black point",
      "outputWhite": "Output white point",
      "adjustment": "Adjustment tool",
      "selectedRegion": "selected region",
      "selectedObjectOnly": "Selected object only. A saved Core mask is required.",
      "wholeFrame": "Whole frame — only for general processing without a requirement to preserve individual objects."
    },
    "operation": {
      "maskedExposure": "Exposure · selected region",
      "maskedWhiteBalance": "White balance · selected region",
      "maskedLevels": "Levels · selected region",
      "backgroundIsolation": "Isolate selected object"
    },
    "examples": {
      "brightenFabric": "Slightly brighten the clothing while preserving the fabric texture",
      "warmRegion": "Make the selected region a little warmer",
      "increaseContrast": "Increase contrast in the selected region",
      "sunsetSky": "Replace the sky with a sunset without changing the person",
      "changeDress": "Try a different dress while preserving the face and pose"
    },
    "hints": {
      "suggestedValues": "These are suggested starting values, not guaranteed correct processing. Compare the original and the result to make the final decision."
    },
    "warnings": {
      "preservation": "A text instruction alone cannot guarantee what must remain unchanged. Check the exact mask, its boundaries and the final frame.",
      "target": "The region is determined only by your confirmed Core mask, not by words or editor guesses."
    },
    "explanations": {
      "invalid": "Describe in one sentence what to change in the photo (up to 850 characters).",
      "fashion": "Realistic try-on requires control of garment contour, pose and occlusion. Choose an Outfit or garment in Fashion, review the fit, then decide whether to accept the result.",
      "backgroundIsolation": "Background removal requires a Core MASK for the region to keep. No background AI fill is performed.",
      "generative": "This needs generative processing. The original instruction is sent to the existing Core Creative Edit only after explicit confirmation. If Core does not admit a provider, generation is unavailable.",
      "multipleAdjustments": "The request contains several different adjustments. Apply them one at a time and review each result to help preserve the original photo.",
      "unknownAdjustment": "I cannot match this request to a safe tool. Clarify whether you want to brighten, darken, warm or cool, change contrast, or generate an object.",
      "exposure": "An initial exposure value has been suggested. Adjust the slider and confirm the mask; the effect must not create patches or wash out skin.",
      "whiteBalance": "A gentle white-balance value has been suggested. Review skin and white fabric after preview.",
      "levels": "Initial Levels settings. They do not automatically determine artistic contrast; review highlights and shadows."
    },
    "confirmations": {
      "wholeImage": "I confirm sending the photo to a cloud model and creating a free processing account on first use. I understand that the entire frame may change.",
      "mask": "I checked that the selected mask matches my request.",
      "maskBoundaries": "I checked the Core mask boundaries for {target}.",
      "generative": "I confirm running the existing Core Creative Edit with this text instruction."
    },
    "actions": {
      "generateFree": "Generate for free",
      "openFashion": "Open Fashion",
      "openFashionOutfit": "Open Fashion / Outfit and garment fit",
      "drawMask": "Draw / refine mask",
      "showResult": "Show result → accept or discard",
      "createSelectMask": "Create / select mask",
      "generateViaCore": "Request generation through Core"
    },
    "status": {
      "unsupportedRegion": "This command cannot be applied to a separate region. Try editing the whole frame or use local tools.",
      "noConfirmedMask": "No confirmed Core mask. Text does not automatically select skin, face or clothing.",
      "noMaskSelected": "No Core mask is selected. AI does not automatically determine the exact region.",
      "coreMaskSelected": "Core mask selected: {target}. Processing must not affect pixels outside it."
    },
    "errors": {
      "adjustmentFailed": "Could not apply the selected adjustment.",
      "insufficientCredits": "The free cloud-processing allowance is exhausted. A paid subscription is not required and will not be offered.",
      "generationUnavailable": "Generation is unavailable for this Project.",
      "invalidScope": "Choose a valid request and confirm the processing scope.",
      "planNotReady": "Core Creative Edit cannot admit this command yet. Clarify the object, mask or request.",
      "styleConfirmation": "A style change needs additional confirmation in Editor.",
      "busy": "Finish the current operation before starting another AI request.",
      "maskRequired": "Confirm the selected region with a Core mask first.",
      "unsupportedOperation": "This operation is not yet admitted by BERS Core.",
      "editFailed": "The edit could not be completed. The original Project image remains unchanged.",
      "providerPending": "The provider result is still being reconciled. Do not submit again; wait for status reconciliation."
    },
    "values": {
      "ev": "{value} EV"
    },
    "disclaimers": {
      "commandEditor": "Recognition of supported simple commands is limited by explicit rules, not a full visual AI model. The editor does not claim to infer hidden intent or see an object without a real mask. Project changes are committed only after Core Preview → Accept."
    }
  },
  editControls: {
  "history": "Edit history",
  "undo": "Undo",
  "redo": "Redo",
  "reset": "Reset",
  "restore": "Restore original",
  "restoreConfirm": "Restore the original image? You can undo this change from History.",
  "versions": "Versions",
  "saveVersion": "Save current as version",
  "selectedObject": "Selected object: {name}. This instruction will target that object.",
  "wholeImage": "Editing the whole image — no object selected. This instruction will apply to the entire image.",
  "selectObject": "Select an object on the image to use this tool.",
  "describe": "Describe your edit",
  "describeTitle": "Describe an edit",
  "question": "What would you like to change?",
  "instruction": "Your instruction",
  "exampleObject": "e.g. \"make the {name} red\"",
  "exampleWhole": "e.g. \"make the whole image warmer\"",
  "selectFirst": "Select an object first…",
  "preview": "Preview edit",
  "preparing": "Preparing preview…",
  "previewHint": "Your image is not changed until you review the preview and choose Accept.",
  "almost": "Almost there",
  "review": "Review your edit",
  "reviewHint": "Preview ready — not saved yet. Compare both images, then choose Accept to keep the change or Discard to leave your original untouched.",
  "compareMode": "Image comparison mode",
  "before": "Before",
  "after": "After",
  "split": "Split",
  "zoom": "Inspection zoom",
  "boundary": "Split boundary",
  "accept": "Accept",
  "retry": "Retry",
  "discard": "Discard",
  "source": "Source",
  "candidate": "Candidate",
  "unavailable": "unavailable",
  "pixels": "pixels",
  "noSplit": "This operation may change image registration. Split inspection is disabled; review Before and After separately.",
  "different": "Images have different pixel dimensions. Split comparison is disabled to avoid false alignment.",
  "sizeUnknown": "One image cannot be measured. Before and After remain available when its preview loads.",
  "qualityHint": "Zoom uses actual decoded image dimensions (one CSS pixel per source pixel at 100%). This remains a visual preview, not a pixel-level quality certificate. Accept alone commits to Project history.",
  "originalImage": "Original image",
  "editedImage": "Unaccepted edited image",
  "rightSplit": "Edited image, right side of split",
  "leftSplit": "Original image, left side of split"
},
  fashionUi: {
  "wardrobe": "Wardrobe",
  "reload": "Reload wardrobe",
  "addGarment": "Add garment",
  "notice": "Images, stable garment identity and capture evidence come from Managed Garment authority; category, season, material, tags and favorite state come from the revisioned Wardrobe authority.",
  "loading": "Loading canonical wardrobe…",
  "empty": "No managed garments yet. Add a garment photo to create the first stable wardrobe item.",
  "addView": "Add view",
  "archive": "Archive",
  "restore": "Restore",
  "removeFavorite": "Remove {name} from favorites",
  "addFavorite": "Add {name} to favorites",
  "views": "{count} views",
  "captureReady": "4-view capture ready",
  "captureCoverage": "{count}% cardinal coverage",
  "captureUnknown": "Capture not assessed",
  "tryOn": "Try one managed garment",
  "tryOnHint": "Choose one canonical Outfit entry. Selection alone never starts execution.",
  "reloadOutfits": "Reload Try-On Outfit choices",
  "chooseOutfit": "Choose Outfit…",
  "chooseGarment": "Choose garment…",
  "outfitForTryon": "Outfit for deterministic Try-On",
  "garmentForTryon": "Garment entry for deterministic Try-On",
  "locked": "Locked selection: {name}",
  "refreshError": "Try-On choices could not be refreshed. Reload canonical Outfits before trying again.",
  "selectionInvalid": "Try-On selection is invalid."
},
  assetUi: {
    "untitled": "Untitled project",
    "loadFailed": "Unable to load canonical project assets.",
    "title": "Asset Library",
    "subtitle": "Canonical Project artifacts available for safe reuse and navigation.",
    "notice": "Managed uploads, garments, outfits and collections are not connected to the production Asset authority yet. This view only indexes canonical Project artifacts.",
    "search": "Search project assets…",
    "favorites": "Favorites",
    "loading": "Loading canonical assets…",
    "empty": "No canonical Project assets match these filters.",
    "open": "Open project"
  },
};
export default modules;