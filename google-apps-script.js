/**
 * Google Apps Script - Ambulance Activity Record System
 * نظام سجل نشاط الإسعاف
 * 
 * Instructions | التعليمات:
 * 1. Create new Google Sheet named "Ambulance Activity Record"
 * 2. Go to Extensions > Apps Script
 * 3. Delete existing code and paste this entire file
 * 4. Click Deploy > New deployment
 * 5. Select type: Web app
 * 6. Execute as: Me
 * 7. Who has access: Anyone
 * 8. Copy the Web App URL
 * 9. Update the URL in your HTML files
 */

// ============================================
// CONFIGURATION | الإعدادات
// ============================================

const CONFIG = {
  SHEET_NAME_PREFIX: 'Records',
  NURSE_EMAIL: 'hasikhealthcenter@gmail.com',  // Nurses email - receives driver departure/return notifications
  ADMIN_EMAIL: 'officerhasikhc@gmail.com',     // Admin email - receives approved records and 24h reminders
  TIME_ZONE: 'Asia/Muscat',
  EMAIL_FROM_NAME: 'Hasik Health Center - Ambulance Record',
  REMINDER_7H_ENABLED: true,   // Send 7-hour reminder to nurses (in English)
  REMINDER_24H_ENABLED: true   // Send 24-hour reminder to admin (in Arabic)
};

// ============================================
// INITIALIZE SPREADSHEET | تهيئة الجدول
// ============================================

/**
 * Get the sheet name for a given year (e.g. Records2025, Records2026)
 */
function getRecordsSheetName(year) {
  if (!year) year = new Date().getFullYear();
  return CONFIG.SHEET_NAME_PREFIX + year;
}

/**
 * Get all year-based Records sheet names that exist in the spreadsheet
 */
function getAllRecordsSheetNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const names = [];
  ss.getSheets().forEach(function(s) {
    var n = s.getName();
    if (n.indexOf(CONFIG.SHEET_NAME_PREFIX) === 0 && /\d{4}$/.test(n)) {
      names.push(n);
    }
  });
  // Also include legacy 'Records' sheet if it exists (pre-migration)
  if (ss.getSheetByName('Records') && names.indexOf('Records') === -1) {
    names.push('Records');
  }
  return names;
}

function setupSheet(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Migrate legacy 'Records' sheet if it exists and year-based sheets don't
  migrateOldRecordsSheet();
  
  const sheetName = getRecordsSheetName(year);
  let sheet = ss.getSheetByName(sheetName);
  
  // Create sheet if doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  // Setup headers
  const headers = [
    'ID',
    'Timestamp',
    'Vehicle Number',
    'Driver Name',
    'Staff Number',
    'Departure Date',
    'Departure Time',
    'Return Date',
    'Return Time',
    'Destination',
    'Patient Name',
    'Nurse Name',
    'Nurse Staff Number',
    'Ext Support',
    'Doctor Accompanying',
    'Doctor Name'
  ];
  
  // Check if headers exist
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format header row
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e40af')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    // Auto-resize columns
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  } else {
    // Ensure Patient Name column exists (migration for sheets created before this column was added)
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (existingHeaders.indexOf('Patient Name') === -1) {
      sheet.insertColumnAfter(10);
      sheet.getRange(1, 11).setValue('Patient Name');
      sheet.getRange(1, 11).setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold');
    }
    // Ensure Nurse Staff Number column exists (migration)
    const refreshedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (refreshedHeaders.indexOf('Nurse Staff Number') === -1) {
      const lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue('Nurse Staff Number');
      sheet.getRange(1, lastCol + 1).setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold');
    }
    // Ensure Ext Support column exists (migration)
    const headersAfterNurse = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headersAfterNurse.indexOf('Ext Support') === -1) {
      const lastCol2 = sheet.getLastColumn();
      sheet.getRange(1, lastCol2 + 1).setValue('Ext Support');
      sheet.getRange(1, lastCol2 + 1).setBackground('#7c3aed').setFontColor('#ffffff').setFontWeight('bold');
    }
    // Ensure Doctor Accompanying column exists (migration)
    const hAfterExt = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (hAfterExt.indexOf('Doctor Accompanying') === -1) {
      const c1 = sheet.getLastColumn();
      sheet.getRange(1, c1 + 1).setValue('Doctor Accompanying');
      sheet.getRange(1, c1 + 1).setBackground('#065f46').setFontColor('#ffffff').setFontWeight('bold');
    }
    // Ensure Doctor Name column exists (migration)
    const hAfterDocAcc = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (hAfterDocAcc.indexOf('Doctor Name') === -1) {
      const c2 = sheet.getLastColumn();
      sheet.getRange(1, c2 + 1).setValue('Doctor Name');
      sheet.getRange(1, c2 + 1).setBackground('#065f46').setFontColor('#ffffff').setFontWeight('bold');
    }
  }
  
  return sheet;
}

/**
 * Migrate legacy 'Records' sheet to year-based naming.
 * Renames 'Records' → 'Records<YEAR>' based on the most recent record's year,
 * only if no year-based Records sheets exist yet.
 */
function migrateOldRecordsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheet = ss.getSheetByName('Records');
  if (!oldSheet) return; // No legacy sheet
  
  // Check if any year-based sheet already exists — if so, migration already done
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var name = sheets[s].getName();
    if (name !== 'Records' && name.indexOf(CONFIG.SHEET_NAME_PREFIX) === 0 && /\d{4}$/.test(name)) {
      return; // Already migrated
    }
  }
  
  // Determine the year from the data (use departure date of last row, or current year)
  var targetYear = new Date().getFullYear();
  if (oldSheet.getLastRow() > 1) {
    var headers = oldSheet.getRange(1, 1, 1, oldSheet.getLastColumn()).getValues()[0];
    var depDateIdx = headers.indexOf('Departure Date');
    if (depDateIdx >= 0) {
      // Check all unique years in the sheet
      var allData = oldSheet.getRange(2, depDateIdx + 1, oldSheet.getLastRow() - 1, 1).getValues();
      var years = {};
      for (var i = 0; i < allData.length; i++) {
        try {
          var d = new Date(allData[i][0]);
          if (!isNaN(d.getTime())) years[d.getFullYear()] = true;
        } catch(e) {}
      }
      var uniqueYears = Object.keys(years).map(Number).sort();
      if (uniqueYears.length === 1) {
        // All records are same year — just rename
        targetYear = uniqueYears[0];
      } else if (uniqueYears.length > 1) {
        // Multiple years: split records by year
        splitRecordsByYear_(oldSheet, uniqueYears);
        return;
      }
    }
  }
  
  // Simple rename
  oldSheet.setName(getRecordsSheetName(targetYear));
  Logger.log('Migrated legacy Records sheet to ' + getRecordsSheetName(targetYear));
}

/**
 * Split a legacy Records sheet that has multiple years into separate year-based sheets.
 */
function splitRecordsByYear_(oldSheet, years) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var headers = oldSheet.getRange(1, 1, 1, oldSheet.getLastColumn()).getValues()[0];
  var allData = oldSheet.getRange(2, 1, oldSheet.getLastRow() - 1, headers.length).getValues();
  var depDateIdx = headers.indexOf('Departure Date');
  
  // Group rows by year
  var byYear = {};
  for (var i = 0; i < allData.length; i++) {
    var y;
    try { y = new Date(allData[i][depDateIdx]).getFullYear(); } catch(e) { y = new Date().getFullYear(); }
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(allData[i]);
  }
  
  // Create year sheets and copy data
  Object.keys(byYear).forEach(function(yr) {
    var sheetName = getRecordsSheetName(yr);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#1e40af').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
    var rows = byYear[yr];
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    }
    // Add month separators for this year sheet
    addMonthSeparatorsToSheet_(sheet, depDateIdx);
  });
  
  // Delete the old sheet
  ss.deleteSheet(oldSheet);
  Logger.log('Split legacy Records sheet into ' + Object.keys(byYear).length + ' year sheets');
}

/**
 * Sort records by Departure Date and apply month separator shading.
 * Called after migrating records to year-based sheets.
 */
function addMonthSeparatorsToSheet_(sheet, depDateIdx) {
  sortAndFormatSheet_(sheet);
}

/**
 * After appending a new row: sort by departure date, then shade month boundaries.
 */
function ensureMonthSeparator(sheet) {
  sortAndFormatSheet_(sheet);
}

/**
 * Core function: sort all data rows by Departure Date, then shade the first
 * row of each month group with a light tint so months are visually separated.
 */
function sortAndFormatSheet_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var depDateIdx = headers.indexOf('Departure Date');
  if (depDateIdx < 0) return;

  var numCols = sheet.getLastColumn();
  var dataRows = lastRow - 1;

  // 1. Sort data rows by Departure Date (ascending)
  var dataRange = sheet.getRange(2, 1, dataRows, numCols);
  dataRange.sort({ column: depDateIdx + 1, ascending: true });

  // 2. Clear all previous borders and backgrounds on data rows
  dataRange.setBackground(null);
  dataRange.setBorder(false, false, false, false, false, false);

  // 3. Read departure dates after sorting
  var dates = sheet.getRange(2, depDateIdx + 1, dataRows, 1).getValues();

  // 4. Shade first row of each new month group
  var prevMonth = -1;
  for (var i = 0; i < dates.length; i++) {
    try {
      var d = new Date(dates[i][0]);
      if (isNaN(d.getTime())) continue;
      var curMonth = d.getMonth();
      if (curMonth !== prevMonth && prevMonth !== -1) {
        // This row starts a new month — shade it
        sheet.getRange(i + 2, 1, 1, numCols).setBackground('#dbeafe');
      }
      prevMonth = curMonth;
    } catch(e) {}
  }
}

// ============================================
// WEB APP HANDLERS | معالجات التطبيق
// ============================================

function invalidatePendingTripsCache() {
  try { CacheService.getScriptCache().remove('pending_trips_json'); } catch(e) {}
}

/**
 * v40: Server-side deletion log — enables cross-device deletion sync.
 * Stores recent deletions in CacheService (6h TTL). Client pages read this
 * via getPendingTrips/getAdminData responses and filter out deleted items.
 */
function recordServerDeletion(tripId, staffNumber) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get('deleted_trips_log') || '[]';
    var log = JSON.parse(raw);
    log.push({ id: String(tripId || ''), staff: String(staffNumber || ''), ts: Date.now() });
    // Keep only last 50 entries
    if (log.length > 50) log = log.slice(-50);
    cache.put('deleted_trips_log', JSON.stringify(log), 21600); // 6 hours
    // Bump deletion version counter
    var ver = parseInt(cache.get('deletion_version') || '0') + 1;
    cache.put('deletion_version', String(ver), 21600);
  } catch(e) {
    Logger.log('recordServerDeletion error: ' + e.toString());
  }
}

function getServerDeletionLog() {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get('deleted_trips_log');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function getServerDeletionVersion() {
  try {
    return parseInt(CacheService.getScriptCache().get('deletion_version') || '0');
  } catch(e) { return 0; }
}

/**
 * FAST version: Get next trip ID using cached counter.
 * Avoids scanning all sheets on every call. Falls back to full scan if cache is empty.
 */
function getNextTripIdFast() {
  const cache = CacheService.getScriptCache();
  const cachedMax = cache.get('max_trip_id_num');
  
  if (cachedMax) {
    const nextNum = parseInt(cachedMax) + 1;
    // Update cache with new max (6 hour TTL)
    cache.put('max_trip_id_num', String(nextNum), 21600);
    return 'R' + String(nextNum).padStart(3, '0');
  }
  
  // Cache miss — do full scan, then cache the result
  const fullId = getNextTripId();
  const num = parseInt(String(fullId).replace(/\D/g, '')) || 1;
  cache.put('max_trip_id_num', String(num), 21600);
  return fullId;
}

/**
 * Generate the next sequential trip ID by scanning BOTH Records and PendingTrips sheets.
 * This ensures no duplicate IDs even after row deletions, and keeps driver/nurse IDs in sync.
 */
function getNextTripId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let maxNum = 0;
  
  // Scan ALL year-based Records sheets
  const recSheetNames = getAllRecordsSheetNames();
  recSheetNames.forEach(function(name) {
    const rSheet = ss.getSheetByName(name);
    if (rSheet && rSheet.getLastRow() > 1) {
      const ids = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        const num = parseInt(String(ids[i][0]).replace(/\D/g, '')) || 0;
        if (num > maxNum) maxNum = num;
      }
    }
  });
  
  // Scan PendingTrips sheet
  const ptSheet = ss.getSheetByName('PendingTrips');
  if (ptSheet && ptSheet.getLastRow() > 1) {
    const ids = ptSheet.getRange(2, 1, ptSheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      const num = parseInt(String(ids[i][0]).replace(/\D/g, '')) || 0;
      if (num > maxNum) maxNum = num;
    }
  }
  
  // Scan Archived sheet too
  const archSheet = ss.getSheetByName('Archived');
  if (archSheet && archSheet.getLastRow() > 1) {
    const ids = archSheet.getRange(2, 1, archSheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      const num = parseInt(String(ids[i][0]).replace(/\D/g, '')) || 0;
      if (num > maxNum) maxNum = num;
    }
  }
  
  return 'R' + String(maxNum + 1).padStart(3, '0');
}

/**
 * Handle GET requests
 */
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    switch (action) {
      case 'getAllRecords':
        return getAllRecords(e.parameter);
      
      case 'getRecord':
        return getRecord(e.parameter.id);
      
      case 'getStats':
        return getStatistics();
      
      case 'getPendingTrips':
        return getPendingTrips();
      
      case 'getAdminData':
        return getAdminData(e.parameter);
      
      case 'getNurseData':
        return getNurseData(e.parameter);
      
      case 'deletePendingTrip':
        return deletePendingTrip(e.parameter.tripId);
      
      case 'deleteRecord':
        return deleteRecord(e.parameter.id);
      
      case 'validateUser':
        return ContentService
          .createTextOutput(JSON.stringify(validateUser(e.parameter.staffNumber)))
          .setMimeType(ContentService.MimeType.JSON);
      
      case 'getAllUsers':
        return getAllUsers();
      
      case 'getDrivers':
        return getDrivers();
      
      case 'getNurses':
        return getNurses();
      
      case 'getVehicles':
        return getVehicles();
      
      case 'deleteUser':
        return deleteUser(e.parameter.userId);
      
      case 'deleteVehicle':
        return deleteVehicle(e.parameter.vehicleId);
      
      case 'setDefaultVehicle':
        return setDefaultVehicle(e.parameter.vehicleId);
      
      case 'getSettings':
        return getSystemSettings();
      
      case 'getDriverInspections':
        return getDriverInspections(e.parameter);

      case 'getWeeklyInspections':
        return getWeeklyInspections(e.parameter);

      case 'getDraftInspection':
        return getDraftInspection(e.parameter);

      case 'checkInspectionLock':
        return checkInspectionLock(e.parameter);

      case 'getWeekInspectionStatus':
        return getWeekInspectionStatus(e.parameter);

      case 'checkReminders':
        checkPendingTripsAndSendReminders();
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, message: 'Reminders checked and sent if needed' }))
          .setMimeType(ContentService.MimeType.JSON);
      
      case 'postViaGet': {
        // GET-based fallback for POST operations.
        // Solves CORS/redirect failures in PWA/installed app contexts.
        // Data is sent as a URL-encoded JSON payload parameter.
        var payload = e.parameter.payload;
        if (!payload) {
          return ContentService.createTextOutput(JSON.stringify({
            success: false, error: 'Missing payload parameter'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        var postData;
        try {
          postData = JSON.parse(decodeURIComponent(payload));
        } catch (parseErr) {
          try { postData = JSON.parse(payload); } catch(e2) {
            return ContentService.createTextOutput(JSON.stringify({
              success: false, error: 'Invalid payload: ' + parseErr.toString()
            })).setMimeType(ContentService.MimeType.JSON);
          }
        }
        var postAction = postData.action;
        Logger.log('postViaGet routing action: ' + postAction);
        switch (postAction) {
          case 'submitCase':          return submitCase(postData);
          case 'driverDeparture':     return recordDriverDeparture(postData);
          case 'driverReturn':        return recordDriverReturn(postData);
          case 'updateRecord':        return updateRecord(postData);
          case 'submitInspectionWeek':return submitInspectionWeek(postData);
          case 'saveDraftInspection': return saveDraftInspection(postData);
          case 'adminUpdateInspection': return adminUpdateInspection(postData);
          case 'reportFaultAlert': return reportFaultAlert(postData);
          default:
            return ContentService.createTextOutput(JSON.stringify({
              success: false, error: 'Action not supported via GET: ' + postAction
            })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      
      default:
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Invalid action'
          }))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle POST requests
 */
function doPost(e) {
  try {
    // Log incoming request for debugging
    Logger.log('doPost called');
    Logger.log('postData: ' + JSON.stringify(e.postData));
    
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    Logger.log('Action: ' + action);
    Logger.log('Data received: ' + JSON.stringify(data));
    
    switch (action) {
      case 'submitCase':
        return submitCase(data);
      
      case 'driverDeparture':
        return recordDriverDeparture(data);
      
      case 'driverReturn':
        return recordDriverReturn(data);
      
      case 'deleteRecord':
        return deleteRecordWithNotification(data);
      
      case 'archiveRecord':
        return archiveRecord(data);
      
      case 'updateRecord':
        return updateRecord(data);
      
      case 'addUser':
        return addUser(data);
      
      case 'updateUser':
        return updateUser(data);
      
      case 'addVehicle':
        return addVehicle(data);
      
      case 'updateVehicle':
        return updateVehicle(data);
      
      case 'saveSettings':
        return saveSystemSettings(data);

      case 'generatePdf':
        return generatePdfFromHtml(data);

      case 'submitInspectionWeek':
        return submitInspectionWeek(data);

      case 'saveDraftInspection':
        return saveDraftInspection(data);

      case 'adminUpdateInspection':
        return adminUpdateInspection(data);

      case 'reportFaultAlert':
        return reportFaultAlert(data);

      case 'deleteInspectionWeek':
        return deleteInspectionWeek(data);

      default:
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Invalid action'
          }))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// MAIN FUNCTIONS | الوظائف الرئيسية
// ============================================

/**
 * Submit new ambulance case
 */
function submitCase(data) {
  Logger.log('submitCase called');
  
  try {
    // Use lock to prevent duplicate processing from simultaneous requests
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    
    // Determine the year from departure date to write to the correct year sheet
    const depYear = data.departureDate ? new Date(data.departureDate).getFullYear() : new Date().getFullYear();
    const sheet = setupSheet(depYear);
    
    // FAST duplicate check: only scan last 20 rows instead of entire sheet
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const checkRows = Math.min(20, lastRow - 1);
      const startRow = lastRow - checkRows + 1;
      const recentData = sheet.getRange(startRow, 1, checkRows, 7).getValues();
      for (let i = 0; i < recentData.length; i++) {
        if (recentData[i][3] === (data.driverName || '') && 
            recentData[i][4] === (data.staffNumber || '') && 
            recentData[i][5] === (data.departureDate || '') && 
            recentData[i][6] === (data.departureTime || '')) {
          lock.releaseLock();
          Logger.log('Duplicate submitCase detected, skipping');
          return ContentService
            .createTextOutput(JSON.stringify({
              success: true,
              message: 'Case already submitted',
              id: recentData[i][0],
              duplicate: true
            }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    
    // Use the pending trip's ID if provided, otherwise generate with cache
    const id = data.tripId ? data.tripId : getNextTripIdFast();
    // If client provided a tripId, update server cache so future IDs don't collide
    if (data.tripId) {
      try {
        const clientNum = parseInt(String(data.tripId).replace(/\D/g, '')) || 0;
        const cache = CacheService.getScriptCache();
        const currentMax = parseInt(cache.get('max_trip_id_num')) || 0;
        if (clientNum > currentMax) {
          cache.put('max_trip_id_num', String(clientNum), 21600);
        }
      } catch(e) {}
    }
    const timestamp = new Date();
    
    var dataMap = {
      'ID': id,
      'Timestamp': Utilities.formatDate(timestamp, CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'),
      'Vehicle Number': data.vehicleNumber || '',
      'Driver Name': data.driverName || '',
      'Staff Number': data.staffNumber || '',
      'Departure Date': data.departureDate || '',
      'Departure Time': data.departureTime || '',
      'Return Date': data.returnDate || '',
      'Return Time': data.returnTime || '',
      'Destination': data.destination || '',
      'Patient Name': data.patientName || '',
      'Nurse Name': data.nurseName || '',
      'Nurse Staff Number': data.nurseStaffNumber || '',
      'Ext Support': data.extSupport || '',
      'Doctor Accompanying': data.doctorAccompanying || 'no',
      'Doctor Name': data.doctorName || ''
    };
    var sheetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowData = sheetHeaders.map(function(h) {
      return dataMap[h] !== undefined ? dataMap[h] : '';
    });
    
    // Append to sheet — this is the critical save operation
    sheet.appendRow(rowData);
    
    // Mark pending trip as submitted SYNCHRONOUSLY (before response)
    // This ensures the next getNurseData call won't return this trip as pending
    let tripMarkedSubmitted = false;
    if (data.tripId) {
      try {
        tripMarkedSubmitted = markTripAsSubmitted(data.tripId);
        if (tripMarkedSubmitted) {
          Logger.log('Pending trip ' + data.tripId + ' marked as submitted (sync)');
        }
      } catch (markErr) {
        Logger.log('markTripAsSubmitted sync error (will retry in deferred): ' + markErr.toString());
      }
    }
    
    lock.releaseLock();
    
    // Schedule deferred tasks (email, month separator, pending trip update if not already done)
    // These run in a separate trigger execution so the response returns FAST
    try {
      const props = PropertiesService.getScriptProperties();
      const taskData = JSON.stringify({
        data: data,
        id: id,
        depYear: depYear,
        tripAlreadyMarked: tripMarkedSubmitted
      });
      
      // Store task in properties (accessible by trigger in separate execution)
      const existingQueue = props.getProperty('deferred_submit_queue') || '[]';
      const queue = JSON.parse(existingQueue);
      queue.push(taskData);
      props.setProperty('deferred_submit_queue', JSON.stringify(queue));
      
      // Create a time trigger to process deferred tasks
      ScriptApp.newTrigger('processDeferredSubmit')
        .timeBased()
        .after(1)
        .create();
    } catch (deferErr) {
      // If trigger setup fails, run cleanup inline as fallback
      Logger.log('Deferred trigger failed, running inline: ' + deferErr.toString());
      _runSubmitCleanup(data, id, depYear, tripMarkedSubmitted);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'Case submitted successfully',
        id: id
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Process deferred submit tasks (email, month separator, pending trip update)
 * Called by time-based trigger after submitCase returns its response to the client
 */
function processDeferredSubmit() {
  try {
    // Clean up all processDeferredSubmit triggers to avoid accumulation
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processDeferredSubmit') {
        try { ScriptApp.deleteTrigger(triggers[i]); } catch(e) {}
      }
    }
    
    // Read and clear the task queue
    const props = PropertiesService.getScriptProperties();
    const queueJson = props.getProperty('deferred_submit_queue');
    props.deleteProperty('deferred_submit_queue');
    
    if (!queueJson) return;
    const queue = JSON.parse(queueJson);
    
    for (const taskJson of queue) {
      try {
        const task = JSON.parse(taskJson);
        _runSubmitCleanup(task.data, task.id, task.depYear, task.tripAlreadyMarked);
        Logger.log('Deferred cleanup completed for: ' + task.id);
      } catch (e) {
        Logger.log('Error processing deferred task: ' + e.toString());
      }
    }
  } catch (e) {
    Logger.log('processDeferredSubmit error: ' + e.toString());
  }
}

/**
 * Run the cleanup tasks for a submitted case (email, month separator, pending trip)
 */
function _runSubmitCleanup(data, id, depYear, tripAlreadyMarked) {
  // 1. Month separator
  try {
    const sheet = setupSheet(depYear);
    ensureMonthSeparator(sheet);
  } catch (e) {
    Logger.log('Month separator error: ' + e.toString());
  }
  
  // 2. Send admin email
  try {
    sendAdminEmail(data);
    Logger.log('Admin email sent for ' + id);
  } catch (e) {
    Logger.log('Admin email error for ' + id + ': ' + e.toString());
  }
  
  // 3. Update pending trip status (skip if already marked synchronously in submitCase)
  try {
    if (tripAlreadyMarked) {
      Logger.log('Pending trip ' + (data.tripId || '') + ' already marked submitted (sync), skipping');
    } else if (data.tripId) {
      markTripAsSubmitted(data.tripId);
    } else {
      deletePendingTripByStaffNumber(data.staffNumber, data.departureDate);
    }
  } catch (e) {
    Logger.log('Pending trip update error: ' + e.toString());
  }
}

/**
 * Process deferred return email tasks
 * Called by time-based trigger after recordDriverReturn returns its response
 */
function processDeferredReturnEmail() {
  try {
    // Clean up all processDeferredReturnEmail triggers
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processDeferredReturnEmail') {
        try { ScriptApp.deleteTrigger(triggers[i]); } catch(e) {}
      }
    }
    
    // Read and clear the task queue
    const props = PropertiesService.getScriptProperties();
    const queueJson = props.getProperty('deferred_return_email_queue');
    props.deleteProperty('deferred_return_email_queue');
    
    if (!queueJson) return;
    const queue = JSON.parse(queueJson);
    
    for (const taskJson of queue) {
      try {
        const tripData = JSON.parse(taskJson);
        sendTripCompleteEmailToNurse(tripData);
        Logger.log('Deferred return email sent for trip: ' + tripData.tripId);
      } catch (e) {
        Logger.log('Error sending deferred return email: ' + e.toString());
      }
    }
  } catch (e) {
    Logger.log('processDeferredReturnEmail error: ' + e.toString());
  }
}

/**
 * Get all records with optional filters
 */
function getAllRecords(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let records = [];
    let headers = null;
    
    if (params.year && params.year !== 'all') {
      // Read from specific year sheet
      const sheet = setupSheet(parseInt(params.year));
      const data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        headers = data[0];
        records = data.slice(1).map(row => {
          const record = {};
          headers.forEach((header, index) => { record[header] = row[index]; });
          return record;
        });
      }
    } else {
      // Read from ALL year-based sheets
      const sheetNames = getAllRecordsSheetNames();
      sheetNames.forEach(function(name) {
        const sheet = ss.getSheetByName(name);
        if (sheet && sheet.getLastRow() > 1) {
          const data = sheet.getDataRange().getValues();
          if (!headers) headers = data[0];
          const h = data[0];
          data.slice(1).forEach(function(row) {
            const record = {};
            h.forEach(function(header, index) { record[header] = row[index]; });
            records.push(record);
          });
        }
      });
    }
    
    if (records.length === 0) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          data: [],
          count: 0
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (params.month) {
      records = records.filter(r => {
        const date = new Date(r['Departure Date']);
        return (date.getMonth() + 1).toString() === params.month;
      });
    }
    
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      records = records.filter(r => {
        return Object.values(r).some(value => 
          String(value).toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Sort by timestamp (newest first)
    records.sort((a, b) => {
      return new Date(b.Timestamp) - new Date(a.Timestamp);
    });
    
    // Resolve Nurse Name: always use the latest name from Users sheet
    // Handles: (1) employee number stored as name, (2) admin changed nurse name after record was saved
    try {
      const usersSheet = setupUsersSheet();
      const usersData = usersSheet.getDataRange().getValues();
      var staffToNameEn = {};
      var staffToNameAr = {};
      var adminNameEn = '';
      var adminNameAr = '';
      for (var u = 1; u < usersData.length; u++) {
        var sNum = (usersData[u][4] || '').toString().trim();
        var civilId = (usersData[u][5] || '').toString().trim();
        var uNameEn = (usersData[u][3] || '').toString().trim();
        var uNameAr = (usersData[u][2] || '').toString().trim();
        var uType = (usersData[u][1] || '').toString().trim().toLowerCase();
        var uActive = (usersData[u][7] || '').toString().trim();
        if (sNum) {
          staffToNameEn[sNum] = uNameEn;
          staffToNameAr[sNum] = uNameAr;
        }
        if (civilId) {
          staffToNameEn[civilId] = uNameEn;
          staffToNameAr[civilId] = uNameAr;
        }
        if (uType === 'admin' && (uActive === 'true' || uActive === true) && !adminNameEn) {
          adminNameEn = uNameEn;
          adminNameAr = uNameAr;
        }
      }
      records.forEach(function(r) {
        var nurseStaff = (r['Nurse Staff Number'] || '').toString().trim();
        var nurseName = (r['Nurse Name'] || '').toString().trim();
        var extCol = (r['Ext Support'] || '').toString().trim();
        var isExtRecord = !!extCol || nurseName.indexOf('[External Support]') === 0 || nurseStaff === 'EXT_SUPPORT';
        if (isExtRecord) {
          if (!r['Ext Support'] && nurseName.indexOf('[External Support]') === 0) {
            var content = nurseName.replace('[External Support]', '').trim();
            r['Ext Support'] = content || 'External Support';
          }
          // Resolve admin name: replace [External Support]... with admin's real name
          if (nurseName.indexOf('[External Support]') === 0 || !nurseName || nurseName === 'Admin') {
            r['Nurse Name'] = adminNameEn || adminNameAr || nurseName || 'Admin';
          }
          if (nurseStaff !== 'EXT_SUPPORT') {
            r['Nurse Staff Number'] = 'EXT_SUPPORT';
          }
        } else if (nurseStaff && staffToNameEn[nurseStaff]) {
          r['Nurse Name'] = staffToNameEn[nurseStaff] || staffToNameAr[nurseStaff] || nurseName;
        } else if (nurseName && /^\d+$/.test(nurseName) && staffToNameEn[nurseName]) {
          r['Nurse Name'] = staffToNameEn[nurseName] || staffToNameAr[nurseName] || nurseName;
        }
        var driverStaff = (r['Staff Number'] || '').toString().trim();
        if (driverStaff && staffToNameEn[driverStaff]) {
          r['Driver Name'] = staffToNameEn[driverStaff] || staffToNameAr[driverStaff] || r['Driver Name'];
        }
      });
    } catch (lookupErr) {
      Logger.log('Name lookup error (non-fatal): ' + lookupErr.toString());
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        data: records,
        count: records.length
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get single record by ID
 */
function getRecord(id) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getAllRecordsSheetNames();
    
    for (var s = 0; s < sheetNames.length; s++) {
      var sheet = ss.getSheetByName(sheetNames[s]);
      if (!sheet || sheet.getLastRow() <= 1) continue;
      var data = sheet.getDataRange().getValues();
      var headers = data[0];
      var idIndex = headers.indexOf('ID');
      
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idIndex]).trim() === String(id).trim()) {
          const record = {};
          headers.forEach((header, index) => {
            record[header] = data[i][index];
          });
          
          return ContentService
            .createTextOutput(JSON.stringify({
              success: true,
              data: record
            }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Record not found'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete record by ID with notification email
 */
function deleteRecordWithNotification(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getAllRecordsSheetNames();
    let sheet = null;
    let sheetData, headers, idIndex, foundRow = -1;
    
    for (var s = 0; s < sheetNames.length; s++) {
      var candidate = ss.getSheetByName(sheetNames[s]);
      if (!candidate || candidate.getLastRow() <= 1) continue;
      var d = candidate.getDataRange().getValues();
      var h = d[0];
      var idx = h.indexOf('ID');
      for (var i = 1; i < d.length; i++) {
        if (String(d[i][idx]).trim() === String(data.id).trim()) {
          sheet = candidate; sheetData = d; headers = h; idIndex = idx; foundRow = i;
          break;
        }
      }
      if (foundRow >= 0) break;
    }
    
    if (sheet && foundRow >= 0) {
      var i = foundRow;
      {
        // Get record data before deleting
        const record = {};
        headers.forEach((header, index) => {
          record[header] = sheetData[i][index];
        });
        
        // Delete the row
        sheet.deleteRow(i + 1);
        
        // Also delete matching trip from PendingTrips sheet
        try {
          const staffNumber = record['Staff Number'] ? record['Staff Number'].toString().trim() : '';
          let depDate = '';
          if (record['Departure Date'] instanceof Date) {
            depDate = Utilities.formatDate(record['Departure Date'], CONFIG.TIME_ZONE, 'yyyy-MM-dd');
          } else if (record['Departure Date']) {
            depDate = record['Departure Date'].toString().trim();
          }
          if (staffNumber && depDate) {
            deletePendingTripByStaffNumber(staffNumber, depDate);
          }
        } catch (pendingError) {
          Logger.log('Error cleaning PendingTrips: ' + pendingError.toString());
        }
        
        // No email to nurses on deletion — nurses don't need to know about admin deletions
        
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            message: 'Record deleted successfully'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Record not found'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Delete error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Update existing record by ID
 */
function updateRecord(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getAllRecordsSheetNames();
    let sheet = null;
    let sheetData, headers, idIndex, foundRow = -1;
    const targetId = String(data.id).trim();
    
    for (var s = 0; s < sheetNames.length; s++) {
      var candidate = ss.getSheetByName(sheetNames[s]);
      if (!candidate || candidate.getLastRow() <= 1) continue;
      var d = candidate.getDataRange().getValues();
      var h = d[0];
      var idx = h.indexOf('ID');
      for (var ii = 1; ii < d.length; ii++) {
        if (String(d[ii][idx]).trim() === targetId) {
          sheet = candidate; sheetData = d; headers = h; idIndex = idx; foundRow = ii;
          break;
        }
      }
      if (foundRow >= 0) break;
    }
    
    if (sheet && foundRow >= 0) {
      var i = foundRow;
      // Preserve existing values if not provided in update
      const existingNurseName = sheetData[i][headers.indexOf('Nurse Name')] || '';
      const nurseName = (data.nurseName && data.nurseName.trim()) ? data.nurseName : existingNurseName;
      const nurseStaffIdx = headers.indexOf('Nurse Staff Number');
      const existingNurseStaff = nurseStaffIdx >= 0 ? (sheetData[i][nurseStaffIdx] || '') : '';
      const nurseStaffNumber = (data.nurseStaffNumber && data.nurseStaffNumber.trim()) ? data.nurseStaffNumber : existingNurseStaff;
      const extSupportIdx = headers.indexOf('Ext Support');
      const existingExtSupport = extSupportIdx >= 0 ? (sheetData[i][extSupportIdx] || '') : '';
      const extSupport = (data.extSupport !== undefined) ? (data.extSupport || '') : existingExtSupport;
      
      // Build update using header-based mapping (handles extra columns gracefully)
      var updateMap = {
        'ID': data.id,
        'Timestamp': Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'),
        'Vehicle Number': data.vehicleNumber || '',
        'Driver Name': data.driverName || '',
        'Staff Number': data.staffNumber || '',
        'Departure Date': data.departureDate || '',
        'Departure Time': data.departureTime || '',
        'Return Date': data.returnDate || '',
        'Return Time': data.returnTime || '',
        'Destination': data.destination || '',
        'Patient Name': data.patientName || '',
        'Nurse Name': nurseName,
        'Nurse Staff Number': nurseStaffNumber,
        'Ext Support': extSupport,
        'Doctor Accompanying': (data.doctorAccompanying !== undefined) ? data.doctorAccompanying
          : (headers.indexOf('Doctor Accompanying') >= 0 ? (sheetData[i][headers.indexOf('Doctor Accompanying')] || 'no') : 'no'),
        'Doctor Name': (data.doctorName !== undefined) ? data.doctorName
          : (headers.indexOf('Doctor Name') >= 0 ? (sheetData[i][headers.indexOf('Doctor Name')] || '') : '')
      };
      var rowData = headers.map(function(h, ci) {
        return updateMap[h] !== undefined ? updateMap[h] : (sheetData[i][ci] || '');
      });
      
      // Update the row (i+1 because sheet rows are 1-indexed)
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      
      Logger.log('Record updated: ' + data.id);
      
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          message: 'Record updated successfully',
          id: data.id
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Record not found'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Update error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Archive record by ID (mark as archived instead of deleting)
 */
function archiveRecord(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getAllRecordsSheetNames();
    let sheet = null;
    let sheetData, headers, idIndex, foundRow = -1;
    
    for (var s = 0; s < sheetNames.length; s++) {
      var candidate = ss.getSheetByName(sheetNames[s]);
      if (!candidate || candidate.getLastRow() <= 1) continue;
      var d = candidate.getDataRange().getValues();
      var h = d[0];
      var idx = h.indexOf('ID');
      for (var ii = 1; ii < d.length; ii++) {
        if (String(d[ii][idx]).trim() === String(data.id).trim()) {
          sheet = candidate; sheetData = d; headers = h; idIndex = idx; foundRow = ii;
          break;
        }
      }
      if (foundRow >= 0) break;
    }
    
    if (!sheet || foundRow < 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Record not found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Create or get Archive sheet
    let archiveSheet = ss.getSheetByName('Archived');
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet('Archived');
      const archiveHeaders = [...headers, 'Archive Date', 'Archive Reason'];
      archiveSheet.getRange(1, 1, 1, archiveHeaders.length).setValues([archiveHeaders]);
      archiveSheet.getRange(1, 1, 1, archiveHeaders.length)
        .setBackground('#6b7280')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      archiveSheet.setFrozenRows(1);
    }
    
    {
      var i = foundRow;
        // Get record data
        const record = {};
        headers.forEach((header, index) => {
          record[header] = sheetData[i][index];
        });
        
        // Add to archive sheet
        const archiveRow = [...sheetData[i], new Date(), data.reason];
        archiveSheet.appendRow(archiveRow);
        
        // Delete from main sheet
        sheet.deleteRow(i + 1);
        
        // Also delete matching trip from PendingTrips sheet
        try {
          const staffNumber = record['Staff Number'] ? record['Staff Number'].toString().trim() : '';
          let depDate = '';
          if (record['Departure Date'] instanceof Date) {
            depDate = Utilities.formatDate(record['Departure Date'], CONFIG.TIME_ZONE, 'yyyy-MM-dd');
          } else if (record['Departure Date']) {
            depDate = record['Departure Date'].toString().trim();
          }
          if (staffNumber && depDate) {
            deletePendingTripByStaffNumber(staffNumber, depDate);
          }
        } catch (pendingError) {
          Logger.log('Error cleaning PendingTrips during archive: ' + pendingError.toString());
        }
        
        // No email to nurses on archive — nurses don't need to know about admin archiving
        
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            message: 'Record archived successfully'
          }))
          .setMimeType(ContentService.MimeType.JSON);
    }
      
  } catch (error) {
    Logger.log('Archive error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Send notification email when record is deleted or archived
 */
function sendDeleteNotificationEmail(record, reason, actionType) {
  const actionText = actionType === 'archived' ? 'Archived' : 'Deleted';
  const actionTextAr = actionType === 'archived' ? 'تمت أرشفته' : 'تم حذفه';
  
  const subject = `Record ${actionText} - Vehicle ${record['Vehicle Number']}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${actionType === 'archived' ? '#4338ca' : '#dc2626'}; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">Ambulance Activity Record</h1>
        <p style="margin: 5px 0 0 0;">Record ${actionText} Notification</p>
      </div>
      
      <div style="padding: 20px; background: #f9fafb;">
        <h2 style="color: ${actionType === 'archived' ? '#4338ca' : '#dc2626'}; margin-top: 0;">Record ${actionText}</h2>
        
        <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <strong>Reason / السبب:</strong><br>
          ${reason}
        </div>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Vehicle Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${record['Vehicle Number']}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Driver Name:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${record['Driver Name']}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Departure Date:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${record['Departure Date']}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Destination:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${record['Destination']}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Registered By:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${record['Nurse Name'] || ''}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #eff6ff; padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">This is an automated notification from Hasik Health Center Ambulance Record System</p>
      </div>
    </div>
  `;
  
  try {
    MailApp.sendEmail({
      to: CONFIG.NURSE_EMAIL,
      subject: subject,
      htmlBody: htmlBody,
      name: CONFIG.EMAIL_FROM_NAME
    });
    Logger.log('Delete/Archive notification sent to: ' + CONFIG.NURSE_EMAIL);
  } catch (emailError) {
    Logger.log('Failed to send notification email: ' + emailError.toString());
  }
}

/**
 * Get statistics
 */
function getStatistics() {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const sheet = setupSheet(currentYear);
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          data: {
            total: 0,
            thisMonth: 0,
            today: 0
          }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = data[0];
    const dateIndex = headers.indexOf('Departure Date');
    
    const currentMonth = now.getMonth();
    const today = Utilities.formatDate(now, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    
    let thisMonthCount = 0;
    let todayCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      const recordDate = new Date(data[i][dateIndex]);
      const recordDateStr = Utilities.formatDate(recordDate, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
      
      if (recordDate.getMonth() === currentMonth && 
          recordDate.getFullYear() === currentYear) {
        thisMonthCount++;
      }
      
      if (recordDateStr === today) {
        todayCount++;
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        data: {
          total: data.length - 1,
          thisMonth: thisMonthCount,
          today: todayCount
        }
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Combined admin data endpoint - returns stats + records + pending trips in ONE request
 * This avoids GAS single-thread bottleneck from 3 parallel requests
 */
function getAdminData(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const today = Utilities.formatDate(now, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    
    // Determine which year to read based on filter (default: current year)
    const filterYear = (params.year && params.year !== 'all') ? parseInt(params.year) : currentYear;
    const mainSheet = setupSheet(filterYear);
    const mainData = mainSheet.getDataRange().getValues();
    
    // 1. Stats: total = count of records in the selected year sheet
    let stats = { total: 0, thisMonth: 0, today: 0 };
    
    if (mainData.length > 1) {
      const headers = mainData[0];
      const dateIndex = headers.indexOf('Departure Date');
      
      stats.total = mainData.length - 1; // All records in this year sheet
      for (let i = 1; i < mainData.length; i++) {
        const recordDate = new Date(mainData[i][dateIndex]);
        const recordDateStr = Utilities.formatDate(recordDate, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
        if (recordDate.getMonth() === currentMonth && recordDate.getFullYear() === filterYear) {
          stats.thisMonth++;
        }
        if (recordDateStr === today) {
          stats.today++;
        }
      }
    }
    
    // 2. Get Records (with filters) from the year sheet
    let records = [];
    if (mainData.length > 1) {
      const headers = mainData[0];
      records = mainData.slice(1).map(row => {
        const record = {};
        headers.forEach((header, index) => { record[header] = row[index]; });
        return record;
      });
      
      if (params.month) {
        records = records.filter(r => {
          const date = new Date(r['Departure Date']);
          return (date.getMonth() + 1).toString() === params.month;
        });
      }
      if (params.search) {
        const searchLower = params.search.toLowerCase();
        records = records.filter(r => {
          return Object.values(r).some(value => String(value).toLowerCase().includes(searchLower));
        });
      }
      records.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
      
      // Resolve Nurse Name: always use the latest name from Users sheet
      // Handles: (1) employee number stored as name, (2) admin changed nurse name after record was saved
      try {
        const usersSheet = setupUsersSheet();
        const usersData = usersSheet.getDataRange().getValues();
        var staffToNameEn = {};
        var staffToNameAr = {};
        var adminNameEn = '';
        var adminNameAr = '';
        for (var u = 1; u < usersData.length; u++) {
          var sNum = (usersData[u][4] || '').toString().trim();
          var civilId = (usersData[u][5] || '').toString().trim();
          var uNameEn = (usersData[u][3] || '').toString().trim();
          var uNameAr = (usersData[u][2] || '').toString().trim();
          var uType = (usersData[u][1] || '').toString().trim().toLowerCase();
          var uActive = (usersData[u][7] || '').toString().trim();
          if (sNum) {
            staffToNameEn[sNum] = uNameEn;
            staffToNameAr[sNum] = uNameAr;
          }
          if (civilId) {
            staffToNameEn[civilId] = uNameEn;
            staffToNameAr[civilId] = uNameAr;
          }
          if (uType === 'admin' && (uActive === 'true' || uActive === true) && !adminNameEn) {
            adminNameEn = uNameEn;
            adminNameAr = uNameAr;
          }
        }
        records.forEach(function(r) {
          var nurseStaff = (r['Nurse Staff Number'] || '').toString().trim();
          var nurseName = (r['Nurse Name'] || '').toString().trim();
          var extCol = (r['Ext Support'] || '').toString().trim();
          var isExtRecord = !!extCol || nurseName.indexOf('[External Support]') === 0 || nurseStaff === 'EXT_SUPPORT';
          if (isExtRecord) {
            if (!r['Ext Support'] && nurseName.indexOf('[External Support]') === 0) {
              var content = nurseName.replace('[External Support]', '').trim();
              r['Ext Support'] = content || 'External Support';
            }
            // Resolve admin name: replace [External Support]... with admin's real name
            if (nurseName.indexOf('[External Support]') === 0 || !nurseName || nurseName === 'Admin') {
              r['Nurse Name'] = adminNameEn || adminNameAr || nurseName || 'Admin';
            }
            if (nurseStaff !== 'EXT_SUPPORT') {
              r['Nurse Staff Number'] = 'EXT_SUPPORT';
            }
          } else if (nurseStaff && staffToNameEn[nurseStaff]) {
            r['Nurse Name'] = staffToNameEn[nurseStaff] || staffToNameAr[nurseStaff] || nurseName;
          } else if (nurseName && /^\d+$/.test(nurseName) && staffToNameEn[nurseName]) {
            r['Nurse Name'] = staffToNameEn[nurseName] || staffToNameAr[nurseName] || nurseName;
          }
          var driverStaff = (r['Staff Number'] || '').toString().trim();
          if (driverStaff && staffToNameEn[driverStaff]) {
            r['Driver Name'] = staffToNameEn[driverStaff] || staffToNameAr[driverStaff] || r['Driver Name'];
          }
        });
      } catch (lookupErr) {
        Logger.log('Name lookup error (non-fatal): ' + lookupErr.toString());
      }
    }
    
    // 3. Get Pending Trips
    let trips = [];
    const ptSheet = ss.getSheetByName('PendingTrips');
    if (ptSheet && ptSheet.getLastRow() > 1) {
      const ptValues = ptSheet.getRange(2, 1, ptSheet.getLastRow() - 1, 13).getValues();
      
      function formatDate(dateValue) {
        if (!dateValue) return '';
        if (dateValue instanceof Date) {
          return dateValue.getFullYear() + '-' + String(dateValue.getMonth() + 1).padStart(2, '0') + '-' + String(dateValue.getDate()).padStart(2, '0');
        }
        const str = dateValue.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        try {
          const date = new Date(str);
          if (!isNaN(date.getTime())) {
            return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
          }
        } catch (e) {}
        return str;
      }
      
      trips = ptValues.map(row => ({
        tripId: row[0] ? row[0].toString() : '',
        vehicleNumber: row[1] ? row[1].toString() : '',
        driverName: row[2] ? row[2].toString() : '',
        driverNameAr: row[3] ? row[3].toString() : '',
        staffNumber: row[4] ? row[4].toString() : '',
        departureDate: formatDate(row[5]),
        departureTime: row[6] ? row[6].toString() : '',
        returnDate: formatDate(row[7]),
        returnTime: row[8] ? row[8].toString() : '',
        status: row[9] ? row[9].toString().trim().toLowerCase() : 'pending',
        createdAt: row[10] ? row[10].toString() : ''
      }));
      
      trips.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        if (!isNaN(dateA) && !isNaN(dateB)) return dateB - dateA;
        const numA = parseInt((a.tripId || '').replace(/\D/g, '')) || 0;
        const numB = parseInt((b.tripId || '').replace(/\D/g, '')) || 0;
        return numB - numA;
      });
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        stats: stats,
        records: records,
        recordsCount: records.length,
        trips: trips,
        deletedIds: getServerDeletionLog().map(function(e) { return e.id; })
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in getAdminData: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Combined nurse data endpoint - returns pending trips + records + vehicles + yearly total in ONE request
 * Eliminates 3-4 separate requests that were causing severe loading delays
 */
function getNurseData(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Get Records from the correct year sheet
    const filterYear = params.year || new Date().getFullYear().toString();
    const mainSheet = setupSheet(parseInt(filterYear));
    const mainData = mainSheet.getDataRange().getValues();
    let records = [];
    let yearlyTotal = 0;
    
    if (mainData.length > 1) {
      const headers = mainData[0];
      const allRecords = mainData.slice(1).map(row => {
        const record = {};
        headers.forEach((header, index) => { record[header] = row[index]; });
        return record;
      });
      
      yearlyTotal = allRecords.length;
      
      // Filter for month if provided
      if (params.month && params.month !== 'all') {
        records = allRecords.filter(r => {
          try {
            const date = new Date(r['Departure Date']);
            return (date.getMonth() + 1).toString() === params.month;
          } catch(e) { return false; }
        });
      } else {
        records = allRecords;
      }
      
      records.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
      
      // Resolve Nurse Name: always use the latest name from Users sheet
      // Handles: (1) employee number stored as name, (2) admin changed nurse name after record was saved
      try {
        const usersSheet = setupUsersSheet();
        const usersData = usersSheet.getDataRange().getValues();
        var staffToNameEn = {};
        var staffToNameAr = {};
        var adminNameEn = '';
        var adminNameAr = '';
        var nameEnToCurrentEn = {};  // old/current nameEn (lowercase) → current nameEn
        for (var u = 1; u < usersData.length; u++) {
          var sNum = (usersData[u][4] || '').toString().trim();
          var civilId = (usersData[u][5] || '').toString().trim();
          var uNameEn = (usersData[u][3] || '').toString().trim();
          var uNameAr = (usersData[u][2] || '').toString().trim();
          var uType = (usersData[u][1] || '').toString().trim().toLowerCase();
          var uActive = (usersData[u][7] || '').toString().trim();
          if (sNum) {
            staffToNameEn[sNum] = uNameEn;
            staffToNameAr[sNum] = uNameAr;
          }
          if (civilId) {
            staffToNameEn[civilId] = uNameEn;
            staffToNameAr[civilId] = uNameAr;
          }
          if (uType === 'admin' && (uActive === 'true' || uActive === true) && !adminNameEn) {
            adminNameEn = uNameEn;
            adminNameAr = uNameAr;
          }
          // Build reverse map: any known English name → current English name
          if (uNameEn) {
            nameEnToCurrentEn[uNameEn.toLowerCase()] = uNameEn;
          }
        }
        records.forEach(function(r) {
          var nurseStaff = (r['Nurse Staff Number'] || '').toString().trim();
          var nurseName = (r['Nurse Name'] || '').toString().trim();
          var extCol = (r['Ext Support'] || '').toString().trim();
          var isExtRecord = !!extCol || nurseName.indexOf('[External Support]') === 0 || nurseStaff === 'EXT_SUPPORT';
          if (isExtRecord) {
            if (!r['Ext Support'] && nurseName.indexOf('[External Support]') === 0) {
              var content = nurseName.replace('[External Support]', '').trim();
              r['Ext Support'] = content || 'External Support';
            }
            // Resolve admin name: replace [External Support]... with admin's real name
            if (nurseName.indexOf('[External Support]') === 0 || !nurseName || nurseName === 'Admin') {
              r['Nurse Name'] = adminNameEn || adminNameAr || nurseName || 'Admin';
            }
            if (nurseStaff !== 'EXT_SUPPORT') {
              r['Nurse Staff Number'] = 'EXT_SUPPORT';
            }
          } else if (nurseStaff && staffToNameEn[nurseStaff]) {
            r['Nurse Name'] = staffToNameEn[nurseStaff] || staffToNameAr[nurseStaff] || nurseName;
          } else if (nurseName && /^\d+$/.test(nurseName) && staffToNameEn[nurseName]) {
            r['Nurse Name'] = staffToNameEn[nurseName] || staffToNameAr[nurseName] || nurseName;
          }
          var driverStaff = (r['Staff Number'] || '').toString().trim();
          if (driverStaff && staffToNameEn[driverStaff]) {
            r['Driver Name'] = staffToNameEn[driverStaff] || staffToNameAr[driverStaff] || r['Driver Name'];
          }
        });
      } catch (lookupErr) {
        Logger.log('Name lookup error (non-fatal): ' + lookupErr.toString());
      }
    }
    
    // 2. Get Pending Trips
    let trips = [];
    const ptSheet = ss.getSheetByName('PendingTrips');
    if (ptSheet && ptSheet.getLastRow() > 1) {
      const ptValues = ptSheet.getRange(2, 1, ptSheet.getLastRow() - 1, 13).getValues();
      
      function formatDate(dateValue) {
        if (!dateValue) return '';
        if (dateValue instanceof Date) {
          return dateValue.getFullYear() + '-' + String(dateValue.getMonth() + 1).padStart(2, '0') + '-' + String(dateValue.getDate()).padStart(2, '0');
        }
        const str = dateValue.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        try {
          const date = new Date(str);
          if (!isNaN(date.getTime())) {
            return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
          }
        } catch (e) {}
        return str;
      }
      
      trips = ptValues.map(row => ({
        tripId: row[0] ? row[0].toString() : '',
        vehicleNumber: row[1] ? row[1].toString() : '',
        driverName: row[2] ? row[2].toString() : '',
        driverNameAr: row[3] ? row[3].toString() : '',
        staffNumber: row[4] ? row[4].toString() : '',
        departureDate: formatDate(row[5]),
        departureTime: row[6] ? row[6].toString() : '',
        returnDate: formatDate(row[7]),
        returnTime: row[8] ? row[8].toString() : '',
        status: row[9] ? row[9].toString().trim().toLowerCase() : 'pending',
        createdAt: row[10] ? row[10].toString() : ''
      }));
      
      trips.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        if (!isNaN(dateA) && !isNaN(dateB)) return dateB - dateA;
        return 0;
      });
    }
    
    // 3. Get Vehicles
    let vehicles = [];
    const vSheet = ss.getSheetByName('Vehicles');
    if (vSheet && vSheet.getLastRow() > 1) {
      const vData = vSheet.getDataRange().getValues();
      for (let i = 1; i < vData.length; i++) {
        if (vData[i][3] === 'true' || vData[i][3] === true) {
          vehicles.push({
            id: vData[i][0],
            vehicleNumber: vData[i][1],
            description: vData[i][2],
            isDefault: vData[i][4] === 'true' || vData[i][4] === true
          });
        }
      }
    }
    
    // 4. Validate user session if staffNumber provided (avoids separate validateUser call)
    let userData = null;
    if (params.staffNumber) {
      const userResult = validateUser(params.staffNumber);
      if (userResult.success) {
        userData = userResult.user;
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        records: records,
        recordsCount: records.length,
        yearlyTotal: yearlyTotal,
        trips: trips,
        vehicles: vehicles,
        userData: userData,
        deletedIds: getServerDeletionLog().map(function(e) { return e.id; })
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in getNurseData: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// EMAIL FUNCTIONS | وظائف البريد الإلكتروني
// ============================================

/**
 * Send email to nurses (English)
 */
function sendNurseEmail(data) {
  // Check if data exists
  if (!data) {
    Logger.log('sendNurseEmail: No data provided');
    throw new Error('No data provided to sendNurseEmail');
  }
  
  // Handle both direct data and nested data structures
  const vehicleNumber = data.vehicleNumber || data['Vehicle Number'] || 'N/A';
  const driverName = data.driverName || data['Driver Name'] || 'N/A';
  const staffNumber = data.staffNumber || data['Staff Number'] || 'N/A';
  const departureDate = data.departureDate || data['Departure Date'] || 'N/A';
  const departureTime = data.departureTime || data['Departure Time'] || 'N/A';
  const returnDate = data.returnDate || data['Return Date'] || 'N/A';
  const returnTime = data.returnTime || data['Return Time'] || 'N/A';
  const destination = data.destination || data['Destination'] || 'N/A';
  const nurseName = data.nurseName || data['Nurse Name'] || 'N/A';
  const patientName = data.patientName || data['Patient Name'] || 'N/A';

  const subject = `New Ambulance Case - Vehicle ${vehicleNumber}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">Ambulance Activity Record</h1>
        <p style="margin: 5px 0 0 0;">Hasik Health Center - Ministry of Health</p>
      </div>
      
      <div style="padding: 20px; background: #f9fafb;">
        <h2 style="color: #1e40af; margin-top: 0;">New Case Registered</h2>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Vehicle Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${vehicleNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Driver Name:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${driverName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Staff Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${staffNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Departure:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${departureDate} ${departureTime}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Return:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${returnDate} ${returnTime}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Destination:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${destination}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Patient Name:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${patientName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Registered By:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${nurseName}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #eff6ff; padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">This is an automated notification from Hasik Health Center Ambulance Record System</p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: CONFIG.NURSE_EMAIL,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.EMAIL_FROM_NAME
  });
}

/**
 * Send email to admin (Arabic subject, English data)
 */
function sendAdminEmail(data) {
  // Check if data exists
  if (!data) {
    Logger.log('sendAdminEmail: No data provided');
    throw new Error('No data provided to sendAdminEmail');
  }
  
  Logger.log('Starting sendAdminEmail to: ' + CONFIG.ADMIN_EMAIL);
  
  // Handle both direct data and nested data structures
  const vehicleNumber = data.vehicleNumber || data['Vehicle Number'] || 'N/A';
  const driverName = data.driverName || data['Driver Name'] || 'N/A';
  const staffNumber = data.staffNumber || data['Staff Number'] || 'N/A';
  const departureDate = data.departureDate || data['Departure Date'] || 'N/A';
  const departureTime = data.departureTime || data['Departure Time'] || 'N/A';
  const returnDate = data.returnDate || data['Return Date'] || 'N/A';
  const returnTime = data.returnTime || data['Return Time'] || 'N/A';
  const destination = data.destination || data['Destination'] || 'N/A';
  const patientName = data.patientName || data['Patient Name'] || 'N/A';
  const nurseName = data.nurseName || data['Nurse Name'] || 'N/A';

  const subject = 'New Ambulance Case - ' + vehicleNumber;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl; text-align: right;">
      <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">سجل نشاط الإسعاف</h1>
        <p style="margin: 5px 0 0 0;">مركز حاسك الصحي - وزارة الصحة</p>
      </div>
      
      <div style="padding: 20px; background: #f9fafb;">
        <h2 style="color: #1e40af; margin-top: 0;">طلب جديد</h2>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Vehicle Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${vehicleNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Driver Name:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${driverName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Staff Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${staffNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Departure:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${departureDate} ${departureTime}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Return:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${returnDate} ${returnTime}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Destination:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${destination}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Patient Name:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${patientName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Registered By:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${nurseName}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #eff6ff; padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">هذا إشعار تلقائي من نظام سجل الإسعاف بمركز حاسك الصحي</p>
      </div>
    </div>
  `;
  
  try {
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: subject,
      htmlBody: htmlBody,
      name: CONFIG.EMAIL_FROM_NAME
    });
    Logger.log('Admin email sent successfully to: ' + CONFIG.ADMIN_EMAIL);
  } catch (emailError) {
    Logger.log('Failed to send admin email: ' + emailError.toString());
    throw emailError;
  }
}

// ============================================
// UTILITY FUNCTIONS | وظائف مساعدة
// ============================================

/**
 * Test email function
 */
function testEmails() {
  const testData = {
    vehicleNumber: "122-23",
    driverName: "Mohammed Al Rashdi",
    staffNumber: "39634",
    departureDate: "2025-02-07",
    departureTime: "10:00",
    returnDate: "2025-02-07",
    returnTime: "14:00",
    destination: "Salalah Hospital",
    patientName: "John Doe",
    nurseName: "Sarah Ahmed"
  };
  
  try {
    sendNurseEmail(testData);
    sendAdminEmail(testData);
    Logger.log('Test emails sent successfully!');
  } catch (error) {
    Logger.log('Error sending test emails: ' + error);
  }
}

// ============================================
// DRIVER TRIP FUNCTIONS | وظائف رحلات السائق
// ============================================

/**
 * Record driver departure - تسجيل ذهاب السائق
 */
function recordDriverDeparture(data) {
  Logger.log('recordDriverDeparture called with data: ' + JSON.stringify(data));
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('PendingTrips');
    
    // Create PendingTrips sheet if doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet('PendingTrips');
      const headers = ['Trip ID', 'Vehicle Number', 'Driver Name', 'Driver Name AR', 'Staff Number', 'Departure Date', 'Departure Time', 'Return Date', 'Return Time', 'Status', 'Created At', 'Reminder6hSent', 'Reminder24hSent'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#1e40af')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    // Use client-predicted trip ID if valid, otherwise generate server-side
    let tripId;
    if (data.tripId) {
      const clientNum = parseInt(String(data.tripId).replace(/\D/g, '')) || 0;
      const cache = CacheService.getScriptCache();
      let currentMax = parseInt(cache.get('max_trip_id_num')) || 0;
      // If cache is empty, do a full scan to get accurate max before comparing
      if (currentMax === 0) {
        const fullNextId = getNextTripId();
        currentMax = (parseInt(String(fullNextId).replace(/\D/g, '')) || 1) - 1;
        cache.put('max_trip_id_num', String(currentMax), 21600);
      }
      if (clientNum > currentMax) {
        // Client ID is ahead — use it and update server cache
        tripId = data.tripId;
        cache.put('max_trip_id_num', String(clientNum), 21600);
      } else {
        // Client ID is stale (≤ server max) — generate a fresh one to avoid duplicates
        tripId = getNextTripIdFast();
        Logger.log('Client predicted ' + data.tripId + ' but server max is R' + String(currentMax).padStart(3,'0') + ', using ' + tripId);
      }
    } else {
      tripId = getNextTripIdFast();
    }
    const timestamp = new Date();
    
    // Add new trip
    sheet.appendRow([
      tripId,
      data.vehicleNumber || '',
      data.driverName || '',
      data.driverNameAr || '',
      data.staffNumber || '',
      data.departureDate || '',
      data.departureTime || '',
      '', // Return Date
      '', // Return Time
      'pending', // Status
      timestamp,
      false, // Reminder6hSent
      false  // Reminder24hSent
    ]);
    
    invalidatePendingTripsCache();
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        tripId: tripId,
        message: 'تم تسجيل وقت الذهاب بنجاح'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in recordDriverDeparture: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Record driver return - تسجيل عودة السائق
 */
function recordDriverReturn(data) {
  Logger.log('recordDriverReturn called with data: ' + JSON.stringify(data));
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PendingTrips');
    
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'لا توجد رحلات مسجلة'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Use lock to prevent duplicate processing from simultaneous requests
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    
    try {
      // Read data AFTER acquiring lock to get fresh state
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      // Convert staffNumber to string for comparison
      const staffNumberStr = data.staffNumber ? data.staffNumber.toString().trim() : '';
      Logger.log('Looking for staffNumber: ' + staffNumberStr);
      
      for (let i = 1; i < values.length; i++) {
        // Column indices for new structure: 0=TripID, 1=VehicleNumber, 2=DriverName, 3=DriverNameAR, 4=StaffNumber, 5=DepartureDate, 6=DepartureTime, 7=ReturnDate, 8=ReturnTime, 9=Status
        const rowStaffNumber = values[i][4] ? values[i][4].toString().trim() : '';
        const rowStatus = values[i][9] ? values[i][9].toString().trim() : '';
        
        if (rowStaffNumber === staffNumberStr && rowStatus === 'pending') {
          // Batch update: return date + time + status in ONE write (instead of 3 separate setValue calls)
          sheet.getRange(i + 1, 8, 1, 3).setValues([[data.returnDate, data.returnTime, 'complete']]);
          
          Logger.log('Updated row ' + (i + 1) + ' with returnDate=' + data.returnDate + ', returnTime=' + data.returnTime);
          
          const foundTripId = values[i][0];
          
          lock.releaseLock();
          invalidatePendingTripsCache();
          
          // Nurse email disabled — replaced by browser notifications
          /*
          try {
            const tripData = {
              tripId: foundTripId,
              vehicleNumber: values[i][1],
              driverName: values[i][2],
              driverNameAr: values[i][3],
              staffNumber: values[i][4],
              departureDate: values[i][5],
              departureTime: values[i][6],
              returnDate: data.returnDate,
              returnTime: data.returnTime
            };
            const props = PropertiesService.getScriptProperties();
            const existingQueue = props.getProperty('deferred_return_email_queue') || '[]';
            const queue = JSON.parse(existingQueue);
            queue.push(JSON.stringify(tripData));
            props.setProperty('deferred_return_email_queue', JSON.stringify(queue));
            
            ScriptApp.newTrigger('processDeferredReturnEmail')
              .timeBased()
              .after(1)
              .create();
          } catch (deferErr) {
            Logger.log('Deferred email trigger failed, sending inline: ' + deferErr.toString());
            try {
              sendTripCompleteEmailToNurse({
                tripId: foundTripId,
                vehicleNumber: values[i][1],
                driverName: values[i][2],
                driverNameAr: values[i][3],
                staffNumber: values[i][4],
                departureDate: values[i][5],
                departureTime: values[i][6],
                returnDate: data.returnDate,
                returnTime: data.returnTime
              });
            } catch (emailErr) {
              Logger.log('Inline email also failed: ' + emailErr.toString());
            }
          }
          */
          
          return ContentService
            .createTextOutput(JSON.stringify({
              success: true,
              tripId: foundTripId,
              message: 'تم تسجيل وقت العودة بنجاح'
            }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      
      lock.releaseLock();
    } catch (lockError) {
      lock.releaseLock();
      throw lockError;
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'لا توجد رحلة معلقة لهذا السائق'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in recordDriverReturn: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Send email to nurses when trip is complete (driver returned)
 * إرسال إيميل للممرضات عند اكتمال الرحلة
 */
function sendTripCompleteEmailToNurse(tripData) {
  if (!tripData) {
    Logger.log('sendTripCompleteEmailToNurse: No tripData provided');
    throw new Error('No tripData provided to sendTripCompleteEmailToNurse');
  }
  
  const loginUrl = 'https://officerhasikhc.github.io/Register-ambulance-Transfer/login.html';
  
  const subject = '🚑 Please Complete the Required Data';
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🚑 Ambulance Trip Complete</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Hasik Health Center</p>
      </div>
      
      <div style="padding: 25px; background: #f9fafb; border: 1px solid #e5e7eb;">
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-weight: bold;">
            ⚠️ Action Required: Please complete the required data for this trip
          </p>
        </div>
        
        <h2 style="color: #1e40af; margin-top: 0; border-bottom: 2px solid #1e40af; padding-bottom: 10px;">Trip Details</h2>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background: #eff6ff;">
            <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; width: 40%;">Trip ID:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">${tripData.tripId}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Vehicle Number:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">${tripData.vehicleNumber}</td>
          </tr>
          <tr style="background: #eff6ff;">
            <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Driver Name:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">${tripData.driverName}</td>
          </tr>
          <tr>
            <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Staff Number:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">${tripData.staffNumber}</td>
          </tr>
          <tr style="background: #d1fae5;">
            <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">🚗 Departure:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">${tripData.departureDate} at ${tripData.departureTime}</td>
          </tr>
          <tr style="background: #dbeafe;">
            <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">🏥 Return:</td>
            <td style="padding: 12px; border: 1px solid #e5e7eb;">${tripData.returnDate} at ${tripData.returnTime}</td>
          </tr>
        </table>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(30, 64, 175, 0.3);">
            📝 Login to Complete Required Data
          </a>
        </div>
        
        <p style="text-align: center; color: #6b7280; font-size: 13px;">
          Click the button above to login and enter patient information
        </p>
      </div>
      
      <div style="background: #1e40af; padding: 15px; text-align: center; color: white; font-size: 12px; border-radius: 0 0 10px 10px;">
        <p style="margin: 0;">Hasik Health Center - Ambulance Activity Record System</p>
        <p style="margin: 5px 0 0 0; opacity: 0.8;">This is an automated notification</p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: CONFIG.NURSE_EMAIL,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.EMAIL_FROM_NAME
  });
  
  Logger.log('Trip complete email sent to nurses: ' + CONFIG.NURSE_EMAIL);
}

/**
 * Get pending trips for nurses - جلب الرحلات المعلقة للممرضات
 */
function getPendingTrips() {
  try {
    // Server-side cache: return cached result if fresh (avoids slow spreadsheet reads)
    const cache = CacheService.getScriptCache();
    const cached = cache.get('pending_trips_json');
    if (cached) {
      return ContentService
        .createTextOutput(cached)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PendingTrips');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      const emptyResult = JSON.stringify({ success: true, trips: [] });
      cache.put('pending_trips_json', emptyResult, 120);
      return ContentService
        .createTextOutput(emptyResult)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // v40: Self-heal — remove stale "submitted" rows left by older versions
    cleanupSubmittedTrips();
    
    // Re-read after cleanup (rows may have been deleted)
    if (sheet.getLastRow() <= 1) {
      const emptyResult = JSON.stringify({ success: true, trips: [] });
      cache.put('pending_trips_json', emptyResult, 120);
      return ContentService
        .createTextOutput(emptyResult)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13);
    const values = dataRange.getValues();
    
    function formatDate(val) {
      if (!val) return '';
      if (val instanceof Date) {
        return Utilities.formatDate(val, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
      }
      const str = val.toString().trim();
      return str.split('T')[0];
    }
    
    const trips = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      trips.push({
        tripId: row[0] || '',
        vehicleNumber: row[1] || '',
        driverName: row[2] || '',
        driverNameAr: row[3] || '',
        staffNumber: row[4] || '',
        departureDate: formatDate(row[5]),
        departureTime: row[6] || '',
        returnDate: formatDate(row[7]),
        returnTime: row[8] || '',
        status: (row[9] || 'pending').toString().trim().toLowerCase(),
        createdAt: row[10] || ''
      });
    }
    
    trips.sort((a, b) => {
      const numA = parseInt(a.tripId.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.tripId.replace(/\D/g, '')) || 0;
      return numB - numA;
    });
    
    // v40: Include deletion version + recent deleted IDs for cross-device sync
    var delVer = getServerDeletionVersion();
    var delLog = getServerDeletionLog();
    var deletedIds = delLog.map(function(e) { return e.id; });
    
    const result = JSON.stringify({ success: true, trips: trips, deletionVersion: delVer, deletedIds: deletedIds });
    cache.put('pending_trips_json', result, 60);
    
    return ContentService
      .createTextOutput(result)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in getPendingTrips: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Mark trip as submitted - حذف الرحلة من PendingTrips بعد إرسالها
 * v40: Changed from status update to row deletion — submitted trips no longer accumulate
 */
function markTripAsSubmitted(tripId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PendingTrips');
    
    if (!sheet) return false;
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    const tripIdStr = String(tripId).trim();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === tripIdStr) {
        // v40: Delete the row entirely instead of just marking as submitted
        sheet.deleteRow(i + 1);
        invalidatePendingTripsCache();
        Logger.log('markTripAsSubmitted: Deleted pending trip row for ' + tripIdStr);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log('Error in markTripAsSubmitted: ' + error.toString());
    return false;
  }
}

/**
 * v40: Cleanup stale submitted trips that were left from older versions
 * Deletes any PendingTrips rows with status "submitted" (they should have been deleted)
 * Called from getPendingTrips() to self-heal
 */
function cleanupSubmittedTrips() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PendingTrips');
    if (!sheet || sheet.getLastRow() <= 1) return 0;
    
    const values = sheet.getDataRange().getValues();
    let deletedCount = 0;
    
    // Delete from bottom to top to avoid index shifting
    for (let i = values.length - 1; i >= 1; i--) {
      const status = (values[i][9] || '').toString().trim().toLowerCase();
      if (status === 'submitted') {
        sheet.deleteRow(i + 1);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      invalidatePendingTripsCache();
      Logger.log('cleanupSubmittedTrips: Removed ' + deletedCount + ' stale submitted trips');
    }
    return deletedCount;
  } catch (e) {
    Logger.log('cleanupSubmittedTrips error: ' + e.toString());
    return 0;
  }
}

/**
 * Delete a record from main sheet - حذف سجل من الشيت الرئيسي
 */
function deleteRecord(id) {
  try {
    if (!id) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Record ID is required'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getAllRecordsSheetNames();
    const idStr = id.toString().trim();
    
    for (var s = 0; s < sheetNames.length; s++) {
      var sheet = ss.getSheetByName(sheetNames[s]);
      if (!sheet || sheet.getLastRow() <= 1) continue;
      
      var values = sheet.getDataRange().getValues();
      var headers = values[0];
      var staffIndex = headers.indexOf('Staff Number');
      var depDateIndex = headers.indexOf('Departure Date');
      
      for (var i = 1; i < values.length; i++) {
        var rowId = values[i][0] ? values[i][0].toString().trim() : '';
        
        if (rowId === idStr) {
          var staffNumber = values[i][staffIndex] ? values[i][staffIndex].toString().trim() : '';
          var depDate = '';
          if (values[i][depDateIndex] instanceof Date) {
            depDate = Utilities.formatDate(values[i][depDateIndex], CONFIG.TIME_ZONE, 'yyyy-MM-dd');
          } else if (values[i][depDateIndex]) {
            depDate = values[i][depDateIndex].toString().trim();
          }
          
          sheet.deleteRow(i + 1);
          Logger.log('Deleted record: ' + idStr + ' from sheet ' + sheetNames[s]);
          // v40: Record deletion for cross-device sync
          recordServerDeletion(idStr, staffNumber);
          
          // v40: Try both methods to clean PendingTrips — by tripId first, then by staffNumber+date
          try {
            var ptDeleted = false;
            // Method 1: Direct tripId match (most reliable — record ID often = trip ID)
            try {
              var ptSheet = ss.getSheetByName('PendingTrips');
              if (ptSheet && ptSheet.getLastRow() > 1) {
                var ptVals = ptSheet.getDataRange().getValues();
                for (var p = ptVals.length - 1; p >= 1; p--) {
                  if ((ptVals[p][0] || '').toString().trim() === idStr) {
                    ptSheet.deleteRow(p + 1);
                    invalidatePendingTripsCache();
                    ptDeleted = true;
                    Logger.log('deleteRecord: Also deleted PendingTrip by tripId: ' + idStr);
                    break;
                  }
                }
              }
            } catch(e1) {}
            // Method 2: Fallback — staffNumber + departure date
            if (!ptDeleted && staffNumber && depDate) {
              deletePendingTripByStaffNumber(staffNumber, depDate);
            }
          } catch (pendingError) {
            Logger.log('Error cleaning PendingTrips after deleteRecord: ' + pendingError.toString());
          }
          
          return ContentService
            .createTextOutput(JSON.stringify({
              success: true,
              message: 'تم حذف السجل بنجاح',
              deletedId: idStr,
              staffNumber: staffNumber
            }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'لم يتم العثور على السجل'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in deleteRecord: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete a pending trip - حذف رحلة معلقة
 */
function deletePendingTrip(tripId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PendingTrips');
    
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'لا توجد رحلات مسجلة'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (!tripId) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Trip ID is required'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const tripIdStr = tripId.toString().trim();
    
    for (let i = 1; i < values.length; i++) {
      const rowTripId = values[i][0] ? values[i][0].toString().trim() : '';
      
      if (rowTripId === tripIdStr) {
        var staffNum = values[i][4] ? values[i][4].toString().trim() : '';
        // Delete the row
        sheet.deleteRow(i + 1);
        Logger.log('Deleted trip: ' + tripIdStr);
        invalidatePendingTripsCache();
        // v40: Record deletion for cross-device sync
        recordServerDeletion(tripIdStr, staffNum);
        
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            message: 'تم حذف الرحلة بنجاح',
            deletedTripId: tripIdStr
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'لم يتم العثور على الرحلة'
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in deletePendingTrip: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete pending trip by staff number and departure date
 * Called after successful case submission
 */
function deletePendingTripByStaffNumber(staffNumber, departureDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PendingTrips');
  
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log('No pending trips sheet or no data');
    return;
  }
  
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const staffNumberStr = staffNumber ? staffNumber.toString().trim() : '';
  
  // Format departure date for comparison
  let depDateStr = '';
  if (departureDate) {
    if (departureDate instanceof Date) {
      depDateStr = Utilities.formatDate(departureDate, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    } else {
      depDateStr = departureDate.toString().trim();
    }
  }
  
  // Search from bottom to top to avoid index issues when deleting
  // Column indices: 0=TripID, 1=VehicleNumber, 2=DriverName, 3=DriverNameAR, 4=StaffNumber, 5=DepartureDate
  for (let i = values.length - 1; i >= 1; i--) {
    const rowStaffNumber = values[i][4] ? values[i][4].toString().trim() : '';
    let rowDepDate = '';
    if (values[i][5]) {
      if (values[i][5] instanceof Date) {
        rowDepDate = Utilities.formatDate(values[i][5], CONFIG.TIME_ZONE, 'yyyy-MM-dd');
      } else {
        rowDepDate = values[i][5].toString().trim();
      }
    }
    
    // Match by staff number and departure date
    if (rowStaffNumber === staffNumberStr && rowDepDate === depDateStr) {
      sheet.deleteRow(i + 1);
      invalidatePendingTripsCache();
      Logger.log('Deleted pending trip row: ' + (i + 1) + ' for staff: ' + staffNumberStr);
      return;
    }
  }
  
  Logger.log('No matching pending trip found for staff: ' + staffNumberStr + ' date: ' + depDateStr);
}

/**
 * Clear all data (use with caution!)
 */
function clearAllData() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'تحذير / Warning',
    'هل أنت متأكد من حذف جميع البيانات؟\nAre you sure you want to delete all data?',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = getAllRecordsSheetNames();
    sheetNames.forEach(function(name) {
      var sheet = ss.getSheetByName(name);
      if (sheet && sheet.getLastRow() > 1) {
        sheet.deleteRows(2, sheet.getLastRow() - 1);
      }
    });
    ui.alert('تم حذف جميع البيانات\nAll data has been deleted');
  }
}

// ============================================
// USER MANAGEMENT | إدارة المستخدمين
// ============================================

/**
 * Setup Users sheet
 */
function setupUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Users');
  
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    const headers = ['ID', 'Type', 'NameAr', 'NameEn', 'StaffNumber', 'CivilId', 'VehicleNumber', 'Active', 'CreatedAt'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e40af')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    
    // Add default users (admin + nurses + drivers)
    const defaultUsers = [
      ['U001', 'admin', 'عبدالباقي عبدالهادي مرزوق بيت مروس', 'Abdulbaqi Abdulhadi Marzouq Bait Marous', '65886', '', '', 'true', new Date()],
      ['U002', 'nurse', 'ميتي ماثيو', 'Metty Mathew', '79470', '', '', 'true', new Date()],
      ['U003', 'nurse', 'شيرين كوريان', 'Sherine Kurian', '62971', '', '', 'true', new Date()],
      ['U004', 'nurse', 'ساميني ثانكاموني', 'Samini Thankamony', '85181', '', '', 'true', new Date()],
      ['U005', 'nurse', 'آنو ماموتيل', 'Annu Mamootel', '88973', '', '', 'true', new Date()],
      ['U006', 'nurse', 'عائشة سعيد بخيت السليمي', 'Aisha Said Bakhit Al-Sulaimi', '57609', '', '', 'true', new Date()],
      ['U007', 'nurse', 'بخيت محمد الغفيلي المهري', 'Bakhit Mohamed Al-Ghufaili Al-Mahri', '41299', '', '', 'true', new Date()],
      ['U008', 'driver', 'سعد زايد الجنيبي', 'SAAD ZAID AL-JUNAIBI', '39121', '', '', 'true', new Date()],
      ['U009', 'driver', 'حسان ثابت رجب', 'HASSAN THABIT RAJAB', '', '222975657', '', 'true', new Date()],
      ['U010', 'driver', 'محمد الرضه علي', 'MOHAMMED AL-RUDHA ALI', '39634', '', '', 'true', new Date()],
      ['U011', 'driver', 'عبدالعزيز مسلم النقش', 'ABDULAZIZ MUSALLEM AL-NAQSH', '65870', '', '', 'true', new Date()]
    ];
    sheet.getRange(2, 1, defaultUsers.length, defaultUsers[0].length).setValues(defaultUsers);
  }
  
  return sheet;
}

/**
 * Setup Vehicles sheet
 */
function setupVehiclesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Vehicles');
  
  if (!sheet) {
    sheet = ss.insertSheet('Vehicles');
    const headers = ['ID', 'VehicleNumber', 'Description', 'Active', 'IsDefault', 'CreatedAt'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e40af')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

/**
 * Validate user login
 */
function validateUser(staffNumber) {
  const sheet = setupUsersSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // يبحث في الرقم الوظيفي (عمود 4) والرقم المدني (عمود 5)
    if ((row[4] && row[4].toString() === staffNumber) || (row[5] && row[5].toString() === staffNumber)) {
      if (row[7] === 'true' || row[7] === true) {
        // تحديد نوع التوظيف: إذا لم يكن لديه رقم وظيفي ولديه رقم مدني = أجر يومي
        const hasStaffNumber = row[4] && row[4].toString().trim() !== '';
        const hasCivilId = row[5] && row[5].toString().trim() !== '';
        const employeeType = (!hasStaffNumber && hasCivilId) ? 'daily-paid' : 'employee';
        
        return {
          success: true,
          user: {
            id: row[0],
            type: row[1],
            employeeType: employeeType,
            nameAr: row[2],
            nameEn: row[3],
            staffNumber: row[4] || row[5],
            civilId: row[5],
            vehicleNumber: row[6],
            redirect: row[1] === 'admin' ? 'admin-interface.html' : 
                     row[1] === 'nurse' ? 'nurse-interface.html' : 'driver-interface.html'
          }
        };
      }
    }
  }
  
  return { success: false, error: 'User not found' };
}

/**
 * Get all users
 */
function getAllUsers() {
  const sheet = setupUsersSheet();
  const data = sheet.getDataRange().getValues();
  const users = [];
  
  for (let i = 1; i < data.length; i++) {
    users.push({
      id: data[i][0],
      type: data[i][1],
      nameAr: data[i][2],
      nameEn: data[i][3],
      staffNumber: data[i][4],
      civilId: data[i][5],
      vehicleNumber: data[i][6],
      active: data[i][7] === 'true' || data[i][7] === true
    });
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, users: users }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get drivers only
 */
function getDrivers() {
  const sheet = setupUsersSheet();
  const data = sheet.getDataRange().getValues();
  const drivers = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === 'driver' && (data[i][7] === 'true' || data[i][7] === true)) {
      drivers.push({
        id: data[i][0],
        nameAr: data[i][2],
        nameEn: data[i][3],
        staffNumber: data[i][4],
        civilId: data[i][5],
        vehicleNumber: data[i][6]
      });
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, drivers: drivers }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get nurses only
 */
function getNurses() {
  const sheet = setupUsersSheet();
  const data = sheet.getDataRange().getValues();
  const nurses = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === 'nurse' && (data[i][7] === 'true' || data[i][7] === true)) {
      nurses.push({
        id: data[i][0],
        nameAr: data[i][2],
        nameEn: data[i][3],
        staffNumber: data[i][4]
      });
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, nurses: nurses }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Add new user
 */
function addUser(data) {
  const sheet = setupUsersSheet();
  const lastRow = sheet.getLastRow();
  const newId = 'U' + String(lastRow).padStart(3, '0');
  
  const newRow = [
    newId,
    data.type,
    data.nameAr,
    data.nameEn,
    data.staffNumber,
    data.civilId || '',
    data.vehicleNumber || '',
    'true',
    new Date()
  ];
  
  sheet.appendRow(newRow);
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, id: newId }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update user
 * When a name changes, automatically propagates to ALL old records (Records + PendingTrips)
 */
function updateUser(data) {
  const sheet = setupUsersSheet();
  const dataRange = sheet.getDataRange().getValues();
  
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === data.id) {
      // Save old values before update
      var oldType = (dataRange[i][1] || '').toString().trim();
      var oldNameAr = (dataRange[i][2] || '').toString().trim();
      var oldNameEn = (dataRange[i][3] || '').toString().trim();
      var oldStaffNumber = (dataRange[i][4] || '').toString().trim();
      var oldCivilId = (dataRange[i][5] || '').toString().trim();
      
      // Update Users sheet
      sheet.getRange(i + 1, 2).setValue(data.type);
      sheet.getRange(i + 1, 3).setValue(data.nameAr);
      sheet.getRange(i + 1, 4).setValue(data.nameEn);
      sheet.getRange(i + 1, 5).setValue(data.staffNumber);
      sheet.getRange(i + 1, 6).setValue(data.civilId || '');
      sheet.getRange(i + 1, 7).setValue(data.vehicleNumber || '');
      
      // Check if name changed
      var nameArChanged = data.nameAr && data.nameAr !== oldNameAr;
      var nameEnChanged = data.nameEn && data.nameEn !== oldNameEn;
      
      if (nameArChanged || nameEnChanged) {
        // Propagate name change to all old records
        var staffNum = data.staffNumber || oldStaffNumber;
        var civilId = data.civilId || oldCivilId;
        try {
          propagateNameChange({
            type: data.type || oldType,
            oldNameAr: oldNameAr,
            oldNameEn: oldNameEn,
            newNameAr: data.nameAr || oldNameAr,
            newNameEn: data.nameEn || oldNameEn,
            staffNumber: staffNum,
            civilId: civilId
          });
        } catch (propErr) {
          Logger.log('Name propagation error (non-fatal): ' + propErr.toString());
        }
      }
      
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: 'User not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Propagate name change to Records and PendingTrips sheets
 * Called automatically when admin changes a user's name via updateUser
 */
function propagateNameChange(info) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var staffNum = (info.staffNumber || '').toString().trim();
  var civilId = (info.civilId || '').toString().trim();
  var isNurse = info.type === 'nurse';
  var isDriver = info.type === 'driver';
  var updated = 0;
  
  // === 1. Update ALL year-based Records sheets ===
  var recSheetNames = getAllRecordsSheetNames();
  for (var rs = 0; rs < recSheetNames.length; rs++) {
    var recSheet = ss.getSheetByName(recSheetNames[rs]);
    if (!recSheet || recSheet.getLastRow() <= 1) continue;
    var recHeaders = recSheet.getRange(1, 1, 1, recSheet.getLastColumn()).getValues()[0];
    var recData = recSheet.getRange(2, 1, recSheet.getLastRow() - 1, recHeaders.length).getValues();
    
    if (isNurse) {
      var nurseNameCol = recHeaders.indexOf('Nurse Name');
      var nurseStaffCol = recHeaders.indexOf('Nurse Staff Number');
      
      if (nurseNameCol >= 0) {
        for (var r = 0; r < recData.length; r++) {
          var rowNum = r + 2;
          var recNurseStaff = nurseStaffCol >= 0 ? (recData[r][nurseStaffCol] || '').toString().trim() : '';
          var recNurseName = (recData[r][nurseNameCol] || '').toString().trim();
          
          var isMatch = false;
          if (staffNum && recNurseStaff === staffNum) isMatch = true;
          else if (civilId && recNurseStaff === civilId) isMatch = true;
          else if (staffNum && recNurseName === staffNum) isMatch = true;
          else if (civilId && recNurseName === civilId) isMatch = true;
          else if (info.oldNameEn && recNurseName.toLowerCase() === info.oldNameEn.toLowerCase()) isMatch = true;
          else if (info.oldNameAr && recNurseName === info.oldNameAr) isMatch = true;
          
          if (isMatch) {
            if (info.newNameEn && recNurseName !== info.newNameEn) {
              recSheet.getRange(rowNum, nurseNameCol + 1).setValue(info.newNameEn);
              updated++;
            }
            if (nurseStaffCol >= 0 && !recNurseStaff && staffNum) {
              recSheet.getRange(rowNum, nurseStaffCol + 1).setValue(staffNum);
            }
          }
        }
      }
    }
    
    if (isDriver) {
      var driverNameCol = recHeaders.indexOf('Driver Name');
      var driverStaffCol = recHeaders.indexOf('Staff Number');
      
      if (driverNameCol >= 0 && driverStaffCol >= 0) {
        for (var rd = 0; rd < recData.length; rd++) {
          var rdRowNum = rd + 2;
          var recDriverStaff = (recData[rd][driverStaffCol] || '').toString().trim();
          var recDriverName = (recData[rd][driverNameCol] || '').toString().trim();
          
          var isDrvMatch = false;
          if (staffNum && recDriverStaff === staffNum) isDrvMatch = true;
          else if (civilId && recDriverStaff === civilId) isDrvMatch = true;
          else if (info.oldNameEn && recDriverName.toLowerCase() === info.oldNameEn.toLowerCase()) isDrvMatch = true;
          else if (info.oldNameAr && recDriverName === info.oldNameAr) isDrvMatch = true;
          
          if (isDrvMatch && info.newNameEn && recDriverName !== info.newNameEn) {
            recSheet.getRange(rdRowNum, driverNameCol + 1).setValue(info.newNameEn);
            updated++;
          }
        }
      }
    }
  }
  
  // === 2. Update PendingTrips sheet (drivers only) ===
  if (isDriver) {
    var ptSheet = ss.getSheetByName('PendingTrips');
    if (ptSheet && ptSheet.getLastRow() > 1) {
      var ptHeaders = ptSheet.getRange(1, 1, 1, ptSheet.getLastColumn()).getValues()[0];
      var ptData = ptSheet.getRange(2, 1, ptSheet.getLastRow() - 1, ptHeaders.length).getValues();
      
      var ptDriverNameCol = ptHeaders.indexOf('Driver Name');
      var ptDriverNameArCol = ptHeaders.indexOf('Driver Name AR');
      var ptStaffCol = ptHeaders.indexOf('Staff Number');
      
      if (ptDriverNameCol >= 0 && ptStaffCol >= 0) {
        for (var pt = 0; pt < ptData.length; pt++) {
          var ptRowNum = pt + 2;
          var ptStaff = (ptData[pt][ptStaffCol] || '').toString().trim();
          
          var isPtMatch = false;
          if (staffNum && ptStaff === staffNum) isPtMatch = true;
          else if (civilId && ptStaff === civilId) isPtMatch = true;
          
          if (isPtMatch) {
            if (info.newNameEn) {
              ptSheet.getRange(ptRowNum, ptDriverNameCol + 1).setValue(info.newNameEn);
              updated++;
            }
            if (info.newNameAr && ptDriverNameArCol >= 0) {
              ptSheet.getRange(ptRowNum, ptDriverNameArCol + 1).setValue(info.newNameAr);
            }
          }
        }
      }
    }
  }
  
  Logger.log('propagateNameChange: updated ' + updated + ' records for ' + info.type + ' ' + (staffNum || civilId));
}

/**
 * Delete user (soft delete)
 */
function deleteUser(userId) {
  const sheet = setupUsersSheet();
  const dataRange = sheet.getDataRange().getValues();
  
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === userId) {
      sheet.getRange(i + 1, 8).setValue('false');
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: 'User not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get all vehicles
 */
function getVehicles() {
  const sheet = setupVehiclesSheet();
  const data = sheet.getDataRange().getValues();
  const vehicles = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === 'true' || data[i][3] === true) {
      vehicles.push({
        id: data[i][0],
        vehicleNumber: data[i][1],
        description: data[i][2],
        isDefault: data[i][4] === 'true' || data[i][4] === true
      });
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, vehicles: vehicles }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Add vehicle
 */
function addVehicle(data) {
  const sheet = setupVehiclesSheet();
  const lastRow = sheet.getLastRow();
  const newId = 'V' + String(lastRow).padStart(3, '0');
  
  const newRow = [
    newId,
    data.vehicleNumber,
    data.description || '',
    'true',
    data.isDefault ? 'true' : 'false',
    new Date()
  ];
  
  // If this is default, remove default from others
  if (data.isDefault) {
    const allData = sheet.getDataRange().getValues();
    for (let i = 1; i < allData.length; i++) {
      sheet.getRange(i + 1, 5).setValue('false');
    }
  }
  
  sheet.appendRow(newRow);
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, id: newId }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Delete vehicle
 */
function deleteVehicle(vehicleId) {
  const sheet = setupVehiclesSheet();
  const dataRange = sheet.getDataRange().getValues();
  
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === vehicleId) {
      sheet.getRange(i + 1, 4).setValue('false');
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: 'Vehicle not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Set a vehicle as default
 */
function setDefaultVehicle(vehicleId) {
  const sheet = setupVehiclesSheet();
  const dataRange = sheet.getDataRange().getValues();
  
  // Remove default from all vehicles first
  for (let i = 1; i < dataRange.length; i++) {
    sheet.getRange(i + 1, 5).setValue('false');
  }
  
  // Set the selected vehicle as default
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === vehicleId) {
      sheet.getRange(i + 1, 5).setValue('true');
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Default vehicle updated' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: 'Vehicle not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update vehicle
 */
function updateVehicle(data) {
  const sheet = setupVehiclesSheet();
  const dataRange = sheet.getDataRange().getValues();
  
  for (let i = 1; i < dataRange.length; i++) {
    if (dataRange[i][0] === data.vehicleId) {
      if (data.vehicleNumber) sheet.getRange(i + 1, 2).setValue(data.vehicleNumber);
      if (data.description !== undefined) sheet.getRange(i + 1, 3).setValue(data.description);
      
      if (data.isDefault) {
        // Remove default from all first
        for (let j = 1; j < dataRange.length; j++) {
          sheet.getRange(j + 1, 5).setValue('false');
        }
        sheet.getRange(i + 1, 5).setValue('true');
      }
      
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: 'Vehicle not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get system settings from Settings sheet
 */
function getSystemSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Settings');
  
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    const headers = ['Key', 'Value', 'UpdatedAt'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e40af')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  const data = sheet.getDataRange().getValues();
  const settings = {};
  
  for (let i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, settings: settings }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Save system settings to Settings sheet
 */
function saveSystemSettings(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Settings');
  
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    const headers = ['Key', 'Value', 'UpdatedAt'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  
  const existingData = sheet.getDataRange().getValues();
  const timestamp = new Date();
  
  // Update or add each setting
  if (data.settings) {
    for (const [key, value] of Object.entries(data.settings)) {
      let found = false;
      for (let i = 1; i < existingData.length; i++) {
        if (existingData[i][0] === key) {
          sheet.getRange(i + 1, 2).setValue(value);
          sheet.getRange(i + 1, 3).setValue(timestamp);
          found = true;
          break;
        }
      }
      if (!found) {
        sheet.appendRow([key, value, timestamp]);
        existingData.push([key, value, timestamp]);
      }
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// REMINDER SYSTEM | نظام التذكيرات
// ============================================

/**
 * Check for pending trips and send reminders
 * This function should be set up as a time-driven trigger to run every hour
 * 
 * - 7 hours: Send reminder to nurses (in English)
 * - 24 hours: Send reminder to admin (in Arabic)
 */
function checkPendingTripsAndSendReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PendingTrips');
  
  if (!sheet || sheet.getLastRow() <= 1) {
    Logger.log('No pending trips to check');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Column indices: 0=TripID, 1=VehicleNumber, 2=DriverName, 3=DriverNameAR, 4=StaffNumber, 5=DepartureDate, 6=DepartureTime, 7=ReturnDate, 8=ReturnTime, 9=Status, 10=CreatedAt, 11=Reminder6hSent, 12=Reminder24hSent
    const tripId = row[0];
    const vehicleNumber = row[1];
    const driverName = row[2];
    const driverNameAr = row[3];
    const staffNumber = row[4];
    const departureDate = row[5];
    const departureTime = row[6];
    const status = row[9];
    const reminder6hSent = row[11] || false;
    const reminder24hSent = row[12] || false;
    
    // Skip if already submitted or complete
    if (status === 'submitted' || status === 'complete') continue;
    
    // Calculate hours since departure
    let departureDateTime;
    if (departureDate instanceof Date) {
      departureDateTime = new Date(departureDate);
    } else {
      departureDateTime = new Date(departureDate);
    }
    
    // Parse departure time
    if (departureTime) {
      const timeParts = departureTime.toString().match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (timeParts) {
        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2]);
        const ampm = timeParts[3];
        
        if (ampm && ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (ampm && ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        
        departureDateTime.setHours(hours, minutes, 0, 0);
      }
    }
    
    const hoursSinceDeparture = (now - departureDateTime) / (1000 * 60 * 60);
    
    // 7-hour reminder to nurses (English)
    if (CONFIG.REMINDER_7H_ENABLED && hoursSinceDeparture >= 7 && !reminder6hSent && status === 'pending') {
      send7HourReminderToNurse(tripId, driverName, staffNumber, departureDate, departureTime, vehicleNumber);
      sheet.getRange(i + 1, 12).setValue(true); // Mark 7h reminder as sent (column 12 = Reminder6hSent)
      Logger.log('Sent 7-hour reminder for trip: ' + tripId);
    }
    
    // 24-hour reminder to admin (Arabic)
    if (CONFIG.REMINDER_24H_ENABLED && hoursSinceDeparture >= 24 && !reminder24hSent) {
      send24HourReminderToAdmin(tripId, driverNameAr || driverName, staffNumber, departureDate, departureTime, status, vehicleNumber);
      sheet.getRange(i + 1, 13).setValue(true); // Mark 24h reminder as sent (column 13 = Reminder24hSent)
      Logger.log('Sent 24-hour reminder for trip: ' + tripId);
    }
  }
}

/**
 * Send 7-hour reminder to nurses (in English)
 * Reminds nurses that a driver has not registered return time
 */
function send7HourReminderToNurse(tripId, driverName, staffNumber, departureDate, departureTime, vehicleNumber) {
  const loginUrl = 'https://officerhasikhc.github.io/Register-ambulance-Transfer/login.html';
  const subject = `⚠️ REMINDER: Trip #${tripId} - Please Complete Required Data & Register Return`;
  
  // Format date
  let formattedDate = departureDate;
  if (departureDate instanceof Date) {
    formattedDate = Utilities.formatDate(departureDate, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  }
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px;">⚠️ 7-Hour Reminder</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Hasik Health Center - Ambulance Service</p>
      </div>
      
      <div style="padding: 25px;">
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">
            ⏰ A driver departed more than 7 hours ago.<br><br>
            <strong>❓ Has the ambulance returned?</strong> If yes, please register the return time and complete the required data.
          </p>
        </div>
        
        <h3 style="color: #1e40af; margin-bottom: 15px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">Trip Details</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background: #dbeafe;">
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #1e40af; width: 40%;">🚑 Trip ID:</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #1e40af; font-weight: bold; font-size: 18px;">${tripId}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">Vehicle Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${vehicleNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">Driver Name:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${driverName}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">Staff Number:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${staffNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">Departure Date:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">Departure Time:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${departureTime}</td>
          </tr>
        </table>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);">
            📝 Login to Complete Required Data
          </a>
        </div>
        
        <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin-top: 20px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            <strong>Action Required:</strong> Please complete the required data and register the return trip in the system.
          </p>
        </div>
      </div>
      
      <div style="background: #f3f4f6; padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">This is an automated reminder from Hasik Health Center Ambulance Record System</p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: CONFIG.NURSE_EMAIL,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.EMAIL_FROM_NAME
  });
}

/**
 * Send 24-hour reminder to admin (in Arabic)
 * Reminds admin that a trip is incomplete after 24 hours
 */
function send24HourReminderToAdmin(tripId, driverNameAr, staffNumber, departureDate, departureTime, status, vehicleNumber) {
  const loginUrl = 'https://officerhasikhc.github.io/Register-ambulance-Transfer/login.html';
  const subject = `⚠️ تنبيه: رحلة غير مكتملة - رقم الرحلة #${tripId}`;
  
  // Format date
  let formattedDate = departureDate;
  if (departureDate instanceof Date) {
    formattedDate = Utilities.formatDate(departureDate, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  }
  
  // Determine what's missing
  let missingInfo = '';
  if (status === 'pending') {
    missingInfo = 'لم يتم تسجيل وقت العودة من قبل السائق، ولم تقم الممرضة بإكمال البيانات المتبقية';
  } else if (status === 'return_registered') {
    missingInfo = 'تم تسجيل وقت العودة، لكن الممرضة لم تكمل البيانات المتبقية (الوجهة، التشخيص، اسم الممرضة)';
  }
  
  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); direction: rtl; text-align: right;">
      <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px;">⚠️ تنبيه: رحلة غير مكتملة</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">مركز حاسك الصحي - خدمة الإسعاف</p>
      </div>
      
      <div style="padding: 25px;">
        <div style="background: #fee2e2; border-right: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 8px 0 0 8px;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">
            ⏰ مضى أكثر من 24 ساعة على هذه الرحلة ولم يتم إكمال بياناتها
          </p>
        </div>
        
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">
            📋 المشكلة: ${missingInfo}
          </p>
        </div>
        
        <h3 style="color: #1e40af; margin-bottom: 15px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">تفاصيل الرحلة</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background: #fee2e2;">
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #dc2626; width: 40%;">🚑 رقم الرحلة:</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: bold; font-size: 18px;">${tripId}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">رقم المركبة:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${vehicleNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">اسم السائق:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${driverNameAr}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">الرقم الوظيفي:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; direction: ltr; text-align: right;">${staffNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">تاريخ المغادرة:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; direction: ltr; text-align: right;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">وقت المغادرة:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; direction: ltr; text-align: right;">${departureTime}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #6b7280;">الحالة:</td>
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
              <span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px; font-size: 13px;">
                ${status === 'pending' ? 'في انتظار العودة' : 'في انتظار إكمال البيانات'}
              </span>
            </td>
          </tr>
        </table>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(220, 38, 38, 0.3);">
            📋 الدخول للنظام ومتابعة الرحلة
          </a>
        </div>
        
        <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin-top: 20px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            <strong>الإجراء المطلوب:</strong> يرجى المتابعة مع السائق والممرضة المسؤولة لإكمال بيانات هذه الرحلة في أقرب وقت.
          </p>
        </div>
      </div>
      
      <div style="background: #f3f4f6; padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">هذا تنبيه تلقائي من نظام سجل الإسعاف - مركز حاسك الصحي</p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: CONFIG.ADMIN_EMAIL,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.EMAIL_FROM_NAME
  });
}

/**
 * Setup time-driven triggers for reminders
 * Run this function once to set up automatic reminders
 */
function setupReminderTriggers() {
  // Delete existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkPendingTripsAndSendReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new trigger to run every hour
  ScriptApp.newTrigger('checkPendingTripsAndSendReminders')
    .timeBased()
    .everyHours(1)
    .create();
  
  Logger.log('Reminder trigger has been set up to run every hour');
}

/**
 * Update PendingTrips sheet to add reminder columns
 */
function updatePendingTripsSheetForReminders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PendingTrips');
  
  if (!sheet) {
    Logger.log('PendingTrips sheet not found');
    return;
  }
  
  // Check if reminder columns exist
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  if (!headers.includes('Reminder6hSent')) {
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1).setValue('Reminder6hSent');
    sheet.getRange(1, lastCol + 2).setValue('Reminder24hSent');
    Logger.log('Added reminder columns to PendingTrips sheet');
  }
}

/**
 * Auto-activate current year Records sheet when opening the spreadsheet.
 * Also ensures the current year sheet exists.
 */
function onOpen() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = getRecordsSheetName();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      // Create current year sheet if it doesn't exist
      setupSheet();
      sheet = ss.getSheetByName(sheetName);
    }
    if (sheet) {
      ss.setActiveSheet(sheet);
    }
  } catch(e) {
    Logger.log('onOpen error: ' + e.toString());
  }
}

/**
 * 🚀 RUN ALL SETUP - شغّل هذه الدالة مرة واحدة لإعداد كل شيء
 * This function runs all setup functions in the correct order
 * تشغيل جميع دوال الإعداد بالترتيب الصحيح
 */
function runAllSetup() {
  const results = [];
  
  Logger.log('========================================');
  Logger.log('🚀 Starting Full System Setup...');
  Logger.log('========================================');
  
  // Step 1: Setup current year Records sheet (and migrate legacy 'Records' if needed)
  try {
    setupSheet();
    results.push('✅ Step 1: Records sheet ready (' + getRecordsSheetName() + ')');
    Logger.log('✅ Step 1: Records sheet ready (' + getRecordsSheetName() + ')');
  } catch (e) {
    results.push('❌ Step 1 Error: ' + e.toString());
    Logger.log('❌ Step 1 Error: ' + e.toString());
  }
  
  // Step 2: Migrate PendingTrips to new structure (if needed)
  try {
    const migrationResult = migratePendingTripsToNewStructure();
    results.push('✅ Step 2: PendingTrips migration - ' + migrationResult);
    Logger.log('✅ Step 2: PendingTrips migration - ' + migrationResult);
  } catch (e) {
    results.push('❌ Step 2 Error: ' + e.toString());
    Logger.log('❌ Step 2 Error: ' + e.toString());
  }
  
  // Step 3: Add reminder columns (if needed)
  try {
    updatePendingTripsSheetForReminders();
    results.push('✅ Step 3: Reminder columns added/verified');
    Logger.log('✅ Step 3: Reminder columns added/verified');
  } catch (e) {
    results.push('❌ Step 3 Error: ' + e.toString());
    Logger.log('❌ Step 3 Error: ' + e.toString());
  }
  
  // Step 4: Setup reminder triggers
  try {
    setupReminderTriggers();
    results.push('✅ Step 4: Reminder triggers configured (runs every hour)');
    Logger.log('✅ Step 4: Reminder triggers configured (runs every hour)');
  } catch (e) {
    results.push('❌ Step 4 Error: ' + e.toString());
    Logger.log('❌ Step 4 Error: ' + e.toString());
  }
  
  Logger.log('========================================');
  Logger.log('🎉 Setup Complete! Results:');
  results.forEach(r => Logger.log(r));
  Logger.log('========================================');
  
  // Show summary to user (only works when run manually)
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      '🚀 Setup Complete | اكتمل الإعداد',
      results.join('\n\n'),
      ui.ButtonSet.OK
    );
  } catch (e) {
    Logger.log('UI not available - results logged above');
  }
  
  return results;
}

/**
 * 🧪 TEST FUNCTION - Send a test 7-hour reminder email
 * دالة اختبار - إرسال إيميل تذكير تجريبي
 */
function testSend7HourReminder() {
  const testTripId = 'TEST-001';
  const testDriverName = 'Test Driver';
  const testStaffNumber = '12345';
  const testDepartureDate = new Date();
  const testDepartureTime = '08:00 AM';
  const testVehicleNumber = 'TEST-VH-001';
  
  try {
    send7HourReminderToNurse(testTripId, testDriverName, testStaffNumber, testDepartureDate, testDepartureTime, testVehicleNumber);
    Logger.log('✅ Test email sent successfully to: ' + CONFIG.NURSE_EMAIL);
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('✅ Test Email Sent', 'A test 7-hour reminder was sent to:\n' + CONFIG.NURSE_EMAIL, ui.ButtonSet.OK);
    } catch (uiError) {
      Logger.log('UI not available');
    }
  } catch (e) {
    Logger.log('❌ Test email failed: ' + e.toString());
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('❌ Test Failed', 'Error: ' + e.toString(), ui.ButtonSet.OK);
    } catch (uiError) {
      Logger.log('UI not available');
    }
  }
}

/**
 * 🧪 TEST FUNCTION - Send a test trip complete email to nurses
 * دالة اختبار - إرسال إيميل اكتمال رحلة تجريبي للممرضات
 */
function testSendTripCompleteEmail() {
  const testTripData = {
    tripId: 'TEST-001',
    vehicleNumber: 'TEST-VH-001',
    driverName: 'Test Driver',
    driverNameAr: 'سائق تجريبي',
    staffNumber: '12345',
    departureDate: '2025-02-11',
    departureTime: '08:00 AM',
    returnDate: '2025-02-11',
    returnTime: '02:00 PM'
  };
  
  try {
    sendTripCompleteEmailToNurse(testTripData);
    Logger.log('✅ Test trip complete email sent to: ' + CONFIG.NURSE_EMAIL);
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('✅ Test Email Sent', 'A test trip complete email was sent to:\n' + CONFIG.NURSE_EMAIL, ui.ButtonSet.OK);
    } catch (uiError) {
      Logger.log('UI not available');
    }
  } catch (e) {
    Logger.log('❌ Test email failed: ' + e.toString());
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('❌ Test Failed', 'Error: ' + e.toString(), ui.ButtonSet.OK);
    } catch (uiError) {
      Logger.log('UI not available');
    }
  }
}

/**
 * 🧪 TEST FUNCTION - Send a test 24-hour reminder email to admin
 * دالة اختبار - إرسال إيميل تذكير 24 ساعة تجريبي للإدارة
 */
function testSend24HourReminder() {
  const testTripId = 'TEST-001';
  const testDriverNameAr = 'سائق تجريبي';
  const testStaffNumber = '12345';
  const testDepartureDate = new Date();
  const testDepartureTime = '08:00 AM';
  const testStatus = 'pending';
  const testVehicleNumber = 'TEST-VH-001';
  
  try {
    send24HourReminderToAdmin(testTripId, testDriverNameAr, testStaffNumber, testDepartureDate, testDepartureTime, testStatus, testVehicleNumber);
    Logger.log('✅ Test 24h email sent successfully to: ' + CONFIG.ADMIN_EMAIL);
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('✅ Test Email Sent', 'A test 24-hour reminder was sent to:\n' + CONFIG.ADMIN_EMAIL, ui.ButtonSet.OK);
    } catch (uiError) {
      Logger.log('UI not available');
    }
  } catch (e) {
    Logger.log('❌ Test 24h email failed: ' + e.toString());
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('❌ Test Failed', 'Error: ' + e.toString(), ui.ButtonSet.OK);
    } catch (uiError) {
      Logger.log('UI not available');
    }
  }
}

/**
 * 📊 CHECK SYSTEM STATUS - View current system configuration
 * عرض حالة النظام الحالية
 */
function checkSystemStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendingSheet = ss.getSheetByName('PendingTrips');
  const recSheetNames = getAllRecordsSheetNames();
  const currentYearSheet = ss.getSheetByName(getRecordsSheetName());
  
  // Check triggers
  const triggers = ScriptApp.getProjectTriggers();
  const reminderTrigger = triggers.find(t => t.getHandlerFunction() === 'checkPendingTripsAndSendReminders');
  
  const status = {
    'Records Sheets': recSheetNames.length > 0 ? '✅ ' + recSheetNames.join(', ') : '❌ Not found',
    'Current Year Sheet': currentYearSheet ? '✅ ' + getRecordsSheetName() + ' (' + (currentYearSheet.getLastRow() - 1) + ' records)' : '❌ Not found',
    'PendingTrips Sheet': pendingSheet ? '✅ Exists (' + (pendingSheet.getLastRow() - 1) + ' pending)' : '❌ Not found',
    'Reminder Trigger': reminderTrigger ? '✅ Active (every hour)' : '❌ Not configured',
    'Nurse Email': CONFIG.NURSE_EMAIL,
    'Admin Email': CONFIG.ADMIN_EMAIL,
    '7h Reminder': CONFIG.REMINDER_7H_ENABLED ? '✅ Enabled' : '❌ Disabled',
    '24h Reminder': CONFIG.REMINDER_24H_ENABLED ? '✅ Enabled' : '❌ Disabled'
  };
  
  // Check PendingTrips structure
  if (pendingSheet) {
    const headers = pendingSheet.getRange(1, 1, 1, pendingSheet.getLastColumn()).getValues()[0];
    status['PendingTrips Structure'] = headers.includes('Vehicle Number') ? '✅ New structure' : '⚠️ Old structure (run migration)';
  }
  
  let statusText = '📊 System Status:\n\n';
  for (const [key, value] of Object.entries(status)) {
    statusText += key + ': ' + value + '\n';
  }
  
  Logger.log(statusText);
  
  // Try to show UI alert (only works when run manually, not from trigger)
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('📊 System Status | حالة النظام', statusText, ui.ButtonSet.OK);
  } catch (e) {
    // UI not available (running from trigger), just log
    Logger.log('UI not available - results logged above');
  }
  
  return status;
}

/**
 * ⚠️ MIGRATION FUNCTION - Run this ONCE to update old PendingTrips sheet structure
 * This adds the Vehicle Number column and shifts existing data
 * دالة ترحيل البيانات - شغّلها مرة واحدة لتحديث هيكل الجدول القديم
 */
function migratePendingTripsToNewStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PendingTrips');
  
  if (!sheet) {
    Logger.log('PendingTrips sheet not found - nothing to migrate');
    return 'No PendingTrips sheet found';
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Check if already migrated (Vehicle Number should be column 2)
  if (headers[1] === 'Vehicle Number') {
    Logger.log('PendingTrips sheet already has new structure');
    return 'Already migrated';
  }
  
  // Old structure: Trip ID, Driver Name, Driver Name AR, Staff Number, Departure Date, Departure Time, Return Date, Return Time, Status, Created At
  // New structure: Trip ID, Vehicle Number, Driver Name, Driver Name AR, Staff Number, Departure Date, Departure Time, Return Date, Return Time, Status, Created At, Reminder6hSent, Reminder24hSent
  
  Logger.log('Starting migration of PendingTrips sheet...');
  
  // Insert new column after Trip ID for Vehicle Number
  sheet.insertColumnAfter(1);
  sheet.getRange(1, 2).setValue('Vehicle Number');
  
  // Add reminder columns if not exist
  const newHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!newHeaders.includes('Reminder6hSent')) {
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1).setValue('Reminder6hSent');
    sheet.getRange(1, lastCol + 2).setValue('Reminder24hSent');
  }
  
  // Style the header row
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setBackground('#1e40af');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  
  Logger.log('Migration complete! New structure applied to PendingTrips sheet');
  return 'Migration complete';
}

// ============================================
// PDF GENERATION FROM HTML | توليد PDF من HTML
// ============================================

function generatePdfFromHtml(data) {
  try {
    var html = data.html;
    if (!html) throw new Error('No HTML content provided');
    var blob = HtmlService.createHtmlOutput(html)
      .setTitle('كشف حركة سيارات الاسعاف')
      .getBlob()
      .getAs('application/pdf');
    var base64 = Utilities.base64Encode(blob.getBytes());
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, pdf: base64 }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// VEHICLE INSPECTION MODULE | نظام فحص السيارة اليومي
// ============================================================

/**
 * Ensure the Inspections sheet exists and return it.
 */
function setupInspectionSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Inspections');
  if (!sheet) {
    sheet = ss.insertSheet('Inspections');
    const headers = [
      'ID', 'Submitted_At', 'Week_Start', 'Week_End',
      'Driver_Name', 'Staff_Number', 'Vehicle_Number',
      'Day_Index', 'Day_Name',
      'AM_Time', 'AM_Items', 'AM_Notes',
      'PM_Time', 'PM_Items', 'PM_Notes',
      'Day_Notes', 'Has_Fault', 'Has_Followup', 'Is_Draft'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e40af').setFontColor('#ffffff')
      .setFontWeight('bold').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(11, 300); // AM_Items JSON
    sheet.setColumnWidth(14, 300); // PM_Items JSON
  } else {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('Is_Draft') === -1) {
      const insertCol = sheet.getLastColumn() + 1;
      sheet.insertColumnAfter(sheet.getLastColumn());
      sheet.getRange(1, insertCol).setValue('Is_Draft')
        .setBackground('#1e40af').setFontColor('#ffffff')
        .setFontWeight('bold').setHorizontalAlignment('center');
    }
  }
  return sheet;
}

/**
 * Generate a unique inspection row ID (INS001, INS002, …)
 */
function generateInspectionId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'INS001';
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .flat()
    .filter(function(id) { return String(id).indexOf('INS') === 0; })
    .map(function(id) { return parseInt(String(id).slice(3)) || 0; });
  var maxNum = ids.length > 0 ? Math.max.apply(null, ids) : 0;
  return 'INS' + String(maxNum + 1).padStart(3, '0');
}

/**
 * Save a draft inspection week to the sheet with Is_Draft = 'نعم'.
 */
function saveDraftInspection(data) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Server busy, please retry' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet      = setupInspectionSheet();
    const tz         = CONFIG.TIME_ZONE;
    const submittedAt= Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    const targetWeek = String(data.weekStart || '').trim();
    const staffNumber= String(data.staffNumber || '').trim();
    const dayNames   = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

    if (!targetWeek || !staffNumber) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'staffNumber and weekStart are required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const lastRow = sheet.getLastRow();

    // Guard: reject if another driver is the rightful owner of this week
    var owner = getWeekOwner_(sheet, targetWeek, tz);
    if (owner && owner.ownerStaff !== staffNumber) {
      lock.releaseLock();
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'week_locked', lockedBy: owner.ownerName, lockedStaff: owner.ownerStaff }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (lastRow > 1) {
      const staffCol = 6;
      const weekCol  = 3;
      const statusCol= sheet.getLastColumn();
      var existing   = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      for (var r = existing.length - 1; r >= 0; r--) {
        var cellWeek = existing[r][weekCol-1];
        if (cellWeek instanceof Date) {
          cellWeek = Utilities.formatDate(cellWeek, tz, 'yyyy-MM-dd');
        }
        if (String(existing[r][staffCol-1]).trim() === staffNumber &&
            String(cellWeek).trim() === targetWeek &&
            String(existing[r][statusCol-1]).trim() === 'نعم') {
          sheet.deleteRow(r + 2);
        }
      }
    }

    var baseId  = generateInspectionId_(sheet);
    var baseNum = parseInt(String(baseId).slice(3)) || 1;
    var rows    = [];
    var days    = data.days || {};

    for (var d = 0; d < 7; d++) {
      var dayData = days[d] || {};
      var am      = dayData['am'] || {};
      var pm      = dayData['pm'] || {};
      var amItems = am.items || {};
      var pmItems = pm.items || {};
      var allVals = Object.keys(amItems).map(function(k){return amItems[k];})
        .concat(Object.keys(pmItems).map(function(k){return pmItems[k];}));
      var hasFault    = allVals.some(function(v){return v==='fault';});
      var hasFollowup = allVals.some(function(v){return v==='followup';});

      var amObj = { items: amItems, itemsAr: toArItems_(amItems), notes: am.itemNotes || {}, photos: {}, deviceId: String(data.deviceId || '') };
      var pmObj = { items: pmItems, itemsAr: toArItems_(pmItems), notes: pm.itemNotes || {}, photos: {} };

      rows.push([
        'INS' + String(baseNum + d).padStart(3, '0'),
        submittedAt,
        targetWeek,
        String(data.weekEnd || '').trim(),
        data.driverName    || '',
        staffNumber,
        data.vehicleNumber || '',
        d,
        dayNames[d],
        am.time || '',
        JSON.stringify(amObj),
        am.notes || '',
        pm.time || '',
        JSON.stringify(pmObj),
        pm.notes || '',
        dayData.notes || '',
        hasFault    ? 'نعم' : 'لا',
        hasFollowup ? 'نعم' : 'لا',
        'نعم'
      ]);
    }

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    lock.releaseLock();
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'تم حفظ المسودة بنجاح', rows: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    if (lock) try { lock.releaseLock(); } catch(_) {}
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Retrieve a saved draft inspection for a specific driver/week.
 */
function getDraftInspection(params) {
  try {
    var staffNumber = String(params.staffNumber || '').trim();
    var weekStart   = String(params.weekStart || '').trim();
    var sheet       = setupInspectionSheet();
    var lastRow     = sheet.getLastRow();
    var tz          = CONFIG.TIME_ZONE;

    if (!staffNumber || !weekStart) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'staffNumber and weekStart are required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, draft: null }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var staffIdx = headers.indexOf('Staff_Number');
    var weekIdx  = headers.indexOf('Week_Start');
    var dayIdx   = headers.indexOf('Day_Index');
    var statusIdx= headers.indexOf('Is_Draft');
    var submittedIdx = headers.indexOf('Submitted_At');
    var rows = [];

    allData.forEach(function(row) {
      var cellWeek = row[weekIdx];
      if (cellWeek instanceof Date) {
        cellWeek = Utilities.formatDate(cellWeek, tz, 'yyyy-MM-dd');
      }
      if (String(row[staffIdx]).trim() === staffNumber &&
          String(cellWeek).trim() === weekStart &&
          String(row[statusIdx]).trim() === 'نعم') {
        rows.push(row);
      }
    });

    if (rows.length === 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, draft: null }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var dedup = {};
    rows.forEach(function(row) {
      var key = String(row[dayIdx]);
      var submittedAt = row[submittedIdx] || '';
      if (submittedAt instanceof Date) {
        submittedAt = Utilities.formatDate(submittedAt, tz, 'yyyy-MM-dd HH:mm:ss');
      }
      if (!dedup[key] || String(submittedAt) >= String(dedup[key].submittedAt)) {
        dedup[key] = { row: row, submittedAt: submittedAt };
      }
    });

    var draft = { weekStart: weekStart, weekEnd: '', driverName: '', staffNumber: staffNumber, vehicleNumber: '', days: {}, lastUpdatedAt: '' };
    Object.keys(dedup).forEach(function(dayKey) {
      var row = dedup[dayKey].row;
      var rowObj = {};
      headers.forEach(function(h, i) {
        var v = row[i];
        if (v instanceof Date) {
          v = Utilities.formatDate(v, tz, (h === 'Week_Start' || h === 'Week_End') ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
        }
        rowObj[h] = v;
      });
      draft.weekEnd = draft.weekEnd || rowObj.Week_End || draft.weekEnd;
      draft.driverName = draft.driverName || rowObj.Driver_Name || draft.driverName;
      draft.vehicleNumber = draft.vehicleNumber || rowObj.Vehicle_Number || draft.vehicleNumber;
      var session = {};
      try { session = JSON.parse(rowObj.AM_Items || '{}'); } catch(e) { session = {}; }
      // Extract deviceId from the most recent AM session
      if (session.deviceId) draft.deviceId = session.deviceId;
      draft.days[Number(dayKey)] = draft.days[Number(dayKey)] || {};
      draft.days[Number(dayKey)].am = {
        time: rowObj.AM_Time || '',
        items: (session.items || {}),
        itemNotes: (session.notes || {}),
        photos: (session.photos || {})
      };
      try { session = JSON.parse(rowObj.PM_Items || '{}'); } catch(e) { session = {}; }
      draft.days[Number(dayKey)].pm = {
        time: rowObj.PM_Time || '',
        items: (session.items || {}),
        itemNotes: (session.notes || {}),
        photos: (session.photos || {})
      };
      draft.days[Number(dayKey)].notes = rowObj.Day_Notes || '';
      if (!draft.lastUpdatedAt || String(dedup[dayKey].submittedAt) > String(draft.lastUpdatedAt)) {
        draft.lastUpdatedAt = dedup[dayKey].submittedAt;
      }
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, draft: draft }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Determine the rightful owner of an inspection week.
 * Owner = driver with the MOST filled items; tiebreak = earliest Submitted_At.
 * Returns { ownerStaff, ownerName, ownerItems, isDraft } or null (empty week).
 */
function getWeekOwner_(sheet, weekStart, tz) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var staffIdx  = headers.indexOf('Staff_Number');
  var weekIdx   = headers.indexOf('Week_Start');
  var nameIdx   = headers.indexOf('Driver_Name');
  var draftIdx  = headers.indexOf('Is_Draft');
  var amIdx     = headers.indexOf('AM_Items');
  var pmIdx     = headers.indexOf('PM_Items');
  var tsIdx     = headers.indexOf('Submitted_At');

  // Group by staff number
  var groups = {};
  for (var r = 0; r < allData.length; r++) {
    var row = allData[r];
    var cellWeek = row[weekIdx];
    if (cellWeek instanceof Date) cellWeek = Utilities.formatDate(cellWeek, tz, 'yyyy-MM-dd');
    if (String(cellWeek).trim() !== weekStart) continue;

    var staff = String(row[staffIdx] || '').trim();
    if (!staff) continue;

    if (!groups[staff]) groups[staff] = { name: '', items: 0, earliest: '', isDraft: true };
    groups[staff].name = String(row[nameIdx] || '').trim() || groups[staff].name;

    // Count filled items in AM and PM
    try {
      var am = JSON.parse(row[amIdx] || '{}');
      groups[staff].items += Object.values(am.items || {}).filter(Boolean).length;
    } catch(_) {}
    try {
      var pm = JSON.parse(row[pmIdx] || '{}');
      groups[staff].items += Object.values(pm.items || {}).filter(Boolean).length;
    } catch(_) {}

    // Track earliest timestamp
    var ts = row[tsIdx];
    if (ts instanceof Date) ts = Utilities.formatDate(ts, tz, 'yyyy-MM-dd HH:mm:ss');
    ts = String(ts || '');
    if (ts && (!groups[staff].earliest || ts < groups[staff].earliest)) {
      groups[staff].earliest = ts;
    }

    // If any row is submitted (not draft), mark the group as submitted
    if (String(row[draftIdx] || '').trim() !== 'نعم') {
      groups[staff].isDraft = false;
    }
  }

  var staffIds = Object.keys(groups);
  if (staffIds.length === 0) return null;
  if (staffIds.length === 1) {
    var s = staffIds[0];
    return { ownerStaff: s, ownerName: groups[s].name, ownerItems: groups[s].items, isDraft: groups[s].isDraft };
  }

  // Multiple drivers: owner = most items, tiebreak = earliest timestamp
  staffIds.sort(function(a, b) {
    if (groups[b].items !== groups[a].items) return groups[b].items - groups[a].items;
    return (groups[a].earliest || 'z').localeCompare(groups[b].earliest || 'z');
  });
  var winner = staffIds[0];
  return { ownerStaff: winner, ownerName: groups[winner].name, ownerItems: groups[winner].items, isDraft: groups[winner].isDraft };
}

/**
 * Check if an inspection week is locked for the requesting staff member.
 * Uses ownership logic: owner (most items) is NOT locked; everyone else IS.
 * Returns { locked: true/false, lockedBy, lockedStaff, isDraft }
 */
function checkInspectionLock(params) {
  try {
    var weekStart   = String(params.weekStart || '').trim();
    var staffNumber = String(params.staffNumber || '').trim();

    if (!weekStart || !staffNumber) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, locked: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = setupInspectionSheet();
    var tz    = CONFIG.TIME_ZONE;
    var owner = getWeekOwner_(sheet, weekStart, tz);

    // No data for this week — not locked
    if (!owner) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, locked: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Requesting driver IS the owner — not locked
    if (owner.ownerStaff === staffNumber) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, locked: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Requesting driver is NOT the owner — locked
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true, locked: true,
        lockedBy: owner.ownerName, lockedStaff: owner.ownerStaff,
        isDraft: owner.isDraft, ownerItems: owner.ownerItems
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString(), locked: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get comprehensive status of a week for smart week-switching.
 * Returns: { status: 'submitted'|'drafted'|'empty', isOwn, ownerName, ownerStaff, daysWithData, totalItems }
 */
function getWeekInspectionStatus(params) {
  try {
    var weekStart   = String(params.weekStart || '').trim();
    var staffNumber = String(params.staffNumber || '').trim();

    if (!weekStart) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, status: 'empty', isOwn: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sheet   = setupInspectionSheet();
    var lastRow = sheet.getLastRow();
    var tz      = CONFIG.TIME_ZONE;

    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, status: 'empty', isOwn: false }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var staffIdx  = headers.indexOf('Staff_Number');
    var weekIdx   = headers.indexOf('Week_Start');
    var draftIdx  = headers.indexOf('Is_Draft');
    var nameIdx   = headers.indexOf('Driver_Name');
    var dayIdx    = headers.indexOf('Day_Index');
    var amIdx     = headers.indexOf('AM_Items');
    var pmIdx     = headers.indexOf('PM_Items');

    // Collect all rows for this week
    var submitted = [];  // Is_Draft = 'لا'
    var drafts    = [];  // Is_Draft = 'نعم'

    for (var r = 0; r < allData.length; r++) {
      var row = allData[r];
      var cellWeek = row[weekIdx];
      if (cellWeek instanceof Date) {
        cellWeek = Utilities.formatDate(cellWeek, tz, 'yyyy-MM-dd');
      }
      if (String(cellWeek).trim() !== weekStart) continue;

      var isDraft = String(row[draftIdx] || '').trim() === 'نعم';
      var entry = {
        staffNumber: String(row[staffIdx] || '').trim(),
        driverName:  String(row[nameIdx]  || '').trim(),
        dayIndex:    row[dayIdx],
        amItems:     row[amIdx],
        pmItems:     row[pmIdx]
      };

      if (isDraft) {
        drafts.push(entry);
      } else {
        submitted.push(entry);
      }
    }

    // Priority: submitted > drafted > empty
    if (submitted.length > 0) {
      var ownerStaff = submitted[0].staffNumber;
      var ownerName  = submitted[0].driverName;
      var isOwn      = (ownerStaff === staffNumber);
      var daysSet    = {};
      var totalItems = 0;
      submitted.forEach(function(e) {
        daysSet[e.dayIndex] = true;
        try {
          var am = JSON.parse(e.amItems || '{}');
          var pm = JSON.parse(e.pmItems || '{}');
          totalItems += Object.values(am.items || {}).filter(Boolean).length;
          totalItems += Object.values(pm.items || {}).filter(Boolean).length;
        } catch(_) {}
      });
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true, status: 'submitted', isOwn: isOwn,
          ownerName: ownerName, ownerStaff: ownerStaff,
          daysWithData: Object.keys(daysSet).length, totalItems: totalItems
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (drafts.length > 0) {
      // Determine owner using item-count logic (most items = owner)
      var draftGroups = {};
      drafts.forEach(function(e) {
        var s = e.staffNumber;
        if (!draftGroups[s]) draftGroups[s] = { name: e.driverName, items: 0, days: {}, entries: [] };
        draftGroups[s].entries.push(e);
        try {
          var am = JSON.parse(e.amItems || '{}');
          var pm = JSON.parse(e.pmItems || '{}');
          var count = Object.values(am.items || {}).filter(Boolean).length +
                      Object.values(pm.items || {}).filter(Boolean).length;
          if (count > 0) draftGroups[s].days[e.dayIndex] = true;
          draftGroups[s].items += count;
        } catch(_) {}
      });
      var ownerStaff = Object.keys(draftGroups).sort(function(a,b) {
        return draftGroups[b].items - draftGroups[a].items;
      })[0];
      var ownerGroup = draftGroups[ownerStaff];
      var isOwn      = (ownerStaff === staffNumber);
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true, status: 'drafted', isOwn: isOwn,
          ownerName: ownerGroup.name, ownerStaff: ownerStaff,
          daysWithData: Object.keys(ownerGroup.days).length, totalItems: ownerGroup.items
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, status: 'empty', isOwn: false }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString(), status: 'empty' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Admin updates a specific inspection day session.
 */
function adminUpdateInspection(data) {
  try {
    var sheet       = setupInspectionSheet();
    var lastRow     = sheet.getLastRow();
    var tz          = CONFIG.TIME_ZONE;
    var staffNumber = String(data.staffNumber || '').trim();
    var weekStart   = String(data.weekStart || '').trim();
    var dayIndex    = parseInt(data.dayIndex);
    var session     = String(data.session || '').toLowerCase();
    var items       = data.items || {};
    var notes       = data.notes || {};

    if (!staffNumber || !weekStart || isNaN(dayIndex) || (session !== 'am' && session !== 'pm')) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'staffNumber, weekStart, dayIndex and session are required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var staffIdx = headers.indexOf('Staff_Number');
    var weekIdx  = headers.indexOf('Week_Start');
    var dayIdx   = headers.indexOf('Day_Index');
    var submitIdx= headers.indexOf('Submitted_At');

    var matching = [];
    allData.forEach(function(row, rowIndex) {
      var cellWeek = row[weekIdx];
      if (cellWeek instanceof Date) {
        cellWeek = Utilities.formatDate(cellWeek, tz, 'yyyy-MM-dd');
      }
      if (String(row[staffIdx]).trim() === staffNumber &&
          String(cellWeek).trim() === weekStart &&
          parseInt(row[dayIdx]) === dayIndex) {
        matching.push({ row: row, rowIndex: rowIndex + 2, submittedAt: row[submitIdx] || '' });
      }
    });

    if (!matching.length) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Inspection row not found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    matching.sort(function(a,b) {
      var aTime = a.submittedAt instanceof Date ? a.submittedAt.getTime() : String(a.submittedAt);
      var bTime = b.submittedAt instanceof Date ? b.submittedAt.getTime() : String(b.submittedAt);
      return String(aTime).localeCompare(String(bTime));
    });
    var target = matching[matching.length - 1];
    var rowValues = target.row.slice();
    var sessionItemsIdx = session === 'am' ? headers.indexOf('AM_Items') : headers.indexOf('PM_Items');
    var sessionNotesIdx = session === 'am' ? headers.indexOf('AM_Notes') : headers.indexOf('PM_Notes');
    var amItems = {};
    var pmItems = {};

    try { amItems = JSON.parse(rowValues[headers.indexOf('AM_Items')] || '{}').items || {}; } catch(e) { amItems = {}; }
    try { pmItems = JSON.parse(rowValues[headers.indexOf('PM_Items')] || '{}').items || {}; } catch(e) { pmItems = {}; }

    var existingPhotos = {};
    try {
      var sessionRaw = JSON.parse(rowValues[sessionItemsIdx] || '{}');
      existingPhotos = sessionRaw.photos || {};
    } catch(e) { existingPhotos = {}; }

    var updatedObj = { items: items, itemsAr: toArItems_(items), notes: notes || {}, photos: existingPhotos };
    rowValues[sessionItemsIdx] = JSON.stringify(updatedObj);

    if (typeof data.sessionNote === 'string') {
      rowValues[sessionNotesIdx] = data.sessionNote;
    }
    if (typeof data.dayNotes === 'string') {
      rowValues[headers.indexOf('Day_Notes')] = data.dayNotes;
    }
    if (typeof data.driverName === 'string' && data.driverName.trim()) {
      rowValues[headers.indexOf('Driver_Name')] = data.driverName.trim();
    }
    if (typeof data.vehicleNumber === 'string' && data.vehicleNumber.trim()) {
      rowValues[headers.indexOf('Vehicle_Number')] = data.vehicleNumber.trim();
    }

    try {
      var parsedAm = JSON.parse(rowValues[headers.indexOf('AM_Items')] || '{}');
      var parsedPm = JSON.parse(rowValues[headers.indexOf('PM_Items')] || '{}');
      var allStatuses = Object.values(parsedAm.items || {}).concat(Object.values(parsedPm.items || {}));
      rowValues[headers.indexOf('Has_Fault')]    = allStatuses.some(function(v){return v==='fault';}) ? 'نعم' : 'لا';
      rowValues[headers.indexOf('Has_Followup')] = allStatuses.some(function(v){return v==='followup';}) ? 'نعم' : 'لا';
    } catch(e) {
      // ignore
    }

    sheet.getRange(target.rowIndex, 1, 1, rowValues.length).setValues([rowValues]);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'تم تحديث الفحص بنجاح' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Submit a full week of inspection data.
 * Payload: { weekStart, weekEnd, driverName, staffNumber, vehicleNumber, days:{0:{am:{time,items,itemNotes},pm:{...},notes}, …} }
 */
function uploadPhotoToDrive_(base64DataUrl, filename) {
  try {
    var parts = base64DataUrl.split(',');
    if (parts.length < 2) return null;
    var decoded = Utilities.base64Decode(parts[1]);
    var blob = Utilities.newBlob(decoded, 'image/jpeg', filename);

    var folderName = 'AmbulanceInspectionPhotos';
    var folderIter = DriveApp.getFoldersByName(folderName);
    var folder = folderIter.hasNext() ? folderIter.next() : DriveApp.createFolder(folderName);

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  } catch(e) {
    Logger.log('uploadPhotoToDrive_ error: ' + e.toString());
    return null;
  }
}

var ITEM_LABELS_AR = {
  tires_front:'الإطارات الأمامية', tires_rear:'الإطارات الخلفية',
  no_oil_leak:'تسرب زيت أو ماء', side_mirrors:'المرايا الجانبية', doors:'الأبواب',
  engine_start:'تشغيل السيارة', gauges:'لوحة العدادات', no_warnings:'مصابيح التحذير',
  ac_system:'نظام التكييف', cabin_electric:'أجهزة المقصورة',
  oil_level:'مستوى الزيت', radiator_water:'ماء الراديتر', front_wipers:'المساحات',
  fuel_level:'مستوى الوقود', battery:'البطارية',
  front_lights:'الأنوار الأمامية', rear_lights:'الأنوار الخلفية',
  brake_lights:'أنوار الفرامل', turn_signals:'إشارات الانعطاف', hazard_lights:'أنوار الطوارئ'
};
var STATUS_AR = { ok:'سليم', followup:'يحتاج متابعة', fault:'عطل' };

function toArItems_(items) {
  var out = {};
  Object.keys(items).forEach(function(k) { out[ITEM_LABELS_AR[k] || k] = STATUS_AR[items[k]] || items[k]; });
  return out;
}

function submitInspectionWeek(data) {
  try {
    const sheet      = setupInspectionSheet();
    const tz         = CONFIG.TIME_ZONE;
    const submittedAt= Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    const dayNames   = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

    var targetWeek = String(data.weekStart || '').trim();
    var staffNumber = String(data.staffNumber || '').trim();

    // Guard: reject if another driver is the rightful owner of this week
    var owner = getWeekOwner_(sheet, targetWeek, tz);
    if (owner && owner.ownerStaff !== staffNumber) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'week_locked', lockedBy: owner.ownerName, lockedStaff: owner.ownerStaff }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Remove any previous submission for this driver + week (re-submit replaces)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const staffCol = 6; // Staff_Number column (1-indexed)
      const weekCol  = 3; // Week_Start column
      var existing   = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      for (var r = existing.length - 1; r >= 0; r--) {
        var cellWeek = existing[r][weekCol-1];
        if (cellWeek instanceof Date) {
          cellWeek = Utilities.formatDate(cellWeek, tz, 'yyyy-MM-dd');
        }
        if (String(existing[r][staffCol-1]).trim() === staffNumber &&
            String(cellWeek).trim() === targetWeek) {
          sheet.deleteRow(r + 2);
        }
      }
    }

    // Pre-generate sequential IDs for the batch
    var baseId = generateInspectionId_(sheet);
    var baseNum = parseInt(String(baseId).slice(3)) || 1;

    var rows = [];
    var days = data.days || {};
    for (var d = 0; d < 7; d++) {
      var dayData  = days[d]   || {};
      var am       = dayData['am'] || {};
      var pm       = dayData['pm'] || {};
      var amItems  = am.items  || {};
      var pmItems  = pm.items  || {};

      var allVals = Object.keys(amItems).map(function(k){return amItems[k];})
        .concat(Object.keys(pmItems).map(function(k){return pmItems[k];}));
      var hasFault    = allVals.some(function(v){return v==='fault';});
      var hasFollowup = allVals.some(function(v){return v==='followup';});

      // Upload photos to Drive and collect URLs
      var amPhotoUrls = {};
      var pmPhotoUrls = {};
      var amPhotosRaw = am.itemPhotos || {};
      var pmPhotosRaw = pm.itemPhotos || {};

      Object.keys(amPhotosRaw).forEach(function(itemId) {
        var p = amPhotosRaw[itemId];
        if (p && p.data && String(p.data).indexOf('data:') === 0) {
          var fname = (data.staffNumber||'x') + '_' + (data.weekStart||'') + '_d' + d + '_am_' + itemId + '.jpg';
          var url = uploadPhotoToDrive_(p.data, fname);
          if (url) amPhotoUrls[itemId] = url;
        } else if (p && p.url) {
          amPhotoUrls[itemId] = p.url;
        }
      });

      Object.keys(pmPhotosRaw).forEach(function(itemId) {
        var p = pmPhotosRaw[itemId];
        if (p && p.data && String(p.data).indexOf('data:') === 0) {
          var fname = (data.staffNumber||'x') + '_' + (data.weekStart||'') + '_d' + d + '_pm_' + itemId + '.jpg';
          var url = uploadPhotoToDrive_(p.data, fname);
          if (url) pmPhotoUrls[itemId] = url;
        } else if (p && p.url) {
          pmPhotoUrls[itemId] = p.url;
        }
      });

      var amObj = { items: amItems, itemsAr: toArItems_(amItems), notes: am.itemNotes || {}, photos: amPhotoUrls };
      var pmObj = { items: pmItems, itemsAr: toArItems_(pmItems), notes: pm.itemNotes || {}, photos: pmPhotoUrls };

      rows.push([
        'INS' + String(baseNum + d).padStart(3, '0'),
        submittedAt,
        targetWeek,
        String(data.weekEnd || '').trim(),
        data.driverName    || '',
        data.staffNumber   || '',
        data.vehicleNumber || '',
        d,
        dayNames[d],
        am.time || '',
        JSON.stringify(amObj),
        am.notes || '',
        pm.time || '',
        JSON.stringify(pmObj),
        pm.notes || '',
        dayData.notes || '',
        hasFault    ? 'نعم' : 'لا',
        hasFollowup ? 'نعم' : 'لا',
        'لا'
      ]);
    }

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'تم إرسال الفحص الأسبوعي بنجاح', rows: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get all inspection weeks for a specific driver (for history display).
 * Returns: { success, weeks: { "2026-03-15": [row, row, …], … } }
 */
function getDriverInspections(params) {
  try {
    var staffNumber = params.staffNumber || '';
    var sheet = setupInspectionSheet();
    var lastRow = sheet.getLastRow();
    var tz = CONFIG.TIME_ZONE;
    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, weeks: {} }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var staffIdx = headers.indexOf('Staff_Number');
    var weekIdx  = headers.indexOf('Week_Start');

    var dateOnlyCols = { 'Week_Start':1, 'Week_End':1 };
    var weeks = {};
    allData.forEach(function(row) {
      if (String(row[staffIdx]).trim() === String(staffNumber).trim()) {
        var wsRaw = row[weekIdx];
        var ws = (wsRaw instanceof Date) ? Utilities.formatDate(wsRaw, tz, 'yyyy-MM-dd') : String(wsRaw);
        if (!weeks[ws]) weeks[ws] = [];
        var obj = {};
        headers.forEach(function(h, i) {
          var v = row[i];
          if (v instanceof Date) {
            v = Utilities.formatDate(v, tz, dateOnlyCols[h] ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
          }
          obj[h] = v;
        });
        weeks[ws].push(obj);
      }
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, weeks: weeks }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get all inspection records (for admin view).
 * Optional params: weekStart, staffNumber
 */
function getWeeklyInspections(params) {
  try {
    var sheet   = setupInspectionSheet();
    var lastRow = sheet.getLastRow();
    var tz      = CONFIG.TIME_ZONE;
    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, inspections: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var dateOnlyCols = { 'Week_Start':1, 'Week_End':1 };

    var filterWeek   = params.weekStart   || '';
    var filterStaff  = params.staffNumber || '';
    var filterStatus = String(params.status || 'sent').toLowerCase();

    var allRows = [];
    allData.forEach(function(row) {
      var obj = {};
      headers.forEach(function(h, i) {
        var v = row[i];
        if (v instanceof Date) {
          v = Utilities.formatDate(v, tz, dateOnlyCols[h] ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
        }
        obj[h] = v;
      });
      if (filterWeek  && String(obj.Week_Start).trim()  !== filterWeek)  return;
      if (filterStaff && String(obj.Staff_Number).trim() !== filterStaff) return;
      var isDraft = String(obj.Is_Draft || 'لا').trim() === 'نعم';
      if (filterStatus === 'sent' && isDraft) return;
      if (filterStatus === 'draft' && !isDraft) return;
      allRows.push(obj);
    });

    // Server-side dedup: keep only the latest row per (Staff_Number, Week_Start, Day_Index)
    var dedup = {};
    allRows.forEach(function(r) {
      var key = String(r.Staff_Number||'').trim() + '|' + String(r.Week_Start||'').trim() + '|' + String(r.Day_Index);
      var prev = dedup[key];
      if (!prev || String(r.Submitted_At || '') >= String(prev.Submitted_At || '')) {
        dedup[key] = r;
      }
    });
    var inspections = Object.keys(dedup).map(function(k) { return dedup[k]; });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, inspections: inspections }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete inspection rows for a specific week.
 * If staffNumber is supplied, only delete that driver's records for the week.
 */
function deleteInspectionWeek(data) {
  try {
    var sheet = setupInspectionSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, deleted: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var weekStart = String(data.weekStart || '').trim();
    var staffNumber = String(data.staffNumber || '').trim();
    var driverName = String(data.driverName || '').trim();

    if (!weekStart) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'weekStart is required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var keepRows = [];
    var deleted = 0;
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var rowWeek = row[2];
      if (rowWeek instanceof Date) {
        rowWeek = Utilities.formatDate(rowWeek, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
      }
      var rowStaff = String(row[5] || '').trim();
      var rowDriver = String(row[4] || '').trim();
      var matchWeek = String(rowWeek || '').trim() === weekStart;
      var matchStaff = !staffNumber || rowStaff === staffNumber;
      var matchDriver = !driverName || rowDriver === driverName;
      if (matchWeek && matchStaff && matchDriver) {
        deleted += 1;
      } else {
        keepRows.push(row);
      }
    }

    if (deleted > 0) {
      if (values.length > 0) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
        if (keepRows.length > 0) {
          sheet.getRange(2, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
        }
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, deleted: deleted }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ════════════════════════════════════════════════════════════════════════
// ── Instant Fault Alert (email to admin) ──────────────────────────────
// ════════════════════════════════════════════════════════════════════════
function reportFaultAlert(data) {
  try {
    var driverName      = String(data.driverName || '').trim();
    var ambulanceNumber = String(data.ambulanceNumber || '').trim();
    var weekStart       = String(data.weekStart || '').trim();
    var dayIndex        = parseInt(data.dayIndex, 10) || 0;
    var session         = String(data.session || '').trim();
    var sectionLabel    = String(data.sectionLabel || '').trim();
    var itemLabel       = String(data.itemLabel || '').trim();
    var status          = String(data.status || '').trim();
    var note            = String(data.note || '').trim();
    var photo           = String(data.photo || '').trim();
    var alertType       = String(data.alertType || 'fault').trim(); // 'fault' or 'followup'

    var dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    var dayName  = dayNames[dayIndex] || ('يوم ' + dayIndex);
    var sessionAr = session === 'AM' ? 'صباحي' : 'مسائي';
    var now = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm');

    var isFault = (alertType === 'fault');
    var headerColor = isFault ? '#dc2626' : '#f59e0b';
    var headerIcon  = isFault ? '🚨' : '📋';
    var headerTitle = isFault ? 'بلاغ عطل فوري' : 'طلب متابعة';
    var subject = headerIcon + ' ' + headerTitle + ' - ' + itemLabel + ' - سيارة ' + ambulanceNumber;

    var body = '<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">'
      + '<div style="background:' + headerColor + ';color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">'
      + '<h2 style="margin:0;">' + headerIcon + ' ' + headerTitle + '</h2></div>'
      + '<div style="background:#fff;border:1px solid #e5e7eb;padding:20px;border-radius:0 0 8px 8px;">'
      + '<table style="width:100%;border-collapse:collapse;font-size:14px;">'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">السائق</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">' + driverName + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">رقم السيارة</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">' + ambulanceNumber + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">أسبوع المناوبة</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">' + weekStart + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">اليوم / الفترة</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">' + dayName + ' - ' + sessionAr + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">القسم</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">' + sectionLabel + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">البند</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:' + headerColor + ';font-weight:bold;">' + itemLabel + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">الحالة</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">' + (isFault ? 'عطل' : 'يحتاج متابعة') + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #f3f4f6;">ملاحظة</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;">' + (note || '—') + '</td></tr>'
      + '<tr><td style="padding:8px;font-weight:bold;">وقت البلاغ</td><td style="padding:8px;">' + now + '</td></tr>'
      + '</table>';

    if (photo && photo.indexOf('data:') === 0) {
      body += '<div style="margin-top:16px;"><strong>صورة مرفقة:</strong><br>'
        + '<img src="' + photo + '" style="max-width:100%;border-radius:8px;margin-top:8px;" alt="صورة العطل"></div>';
    }

    body += '</div></div>';

    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: subject,
      htmlBody: body
    });

    Logger.log('Fault alert email sent for item: ' + itemLabel + ' by ' + driverName);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'تم إرسال البلاغ' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('reportFaultAlert error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

