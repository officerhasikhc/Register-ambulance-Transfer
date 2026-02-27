/**
 * Google Apps Script - Ambulance Activity Log System
 * نظام سجل نشاط الإسعاف
 * 
 * Instructions | التعليمات:
 * 1. Create new Google Sheet named "Ambulance Activity Log"
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
  EMAIL_FROM_NAME: 'Hasik Health Center - Ambulance Log',
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
    'Nurse Staff Number'
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
 * Add month separator borders to an existing year-based Records sheet.
 * Adds a thick bottom border on the last row of each month group.
 */
function addMonthSeparatorsToSheet_(sheet, depDateIdx) {
  if (sheet.getLastRow() <= 1) return;
  var data = sheet.getRange(2, depDateIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  var numCols = sheet.getLastColumn();
  
  for (var i = 0; i < data.length - 1; i++) {
    try {
      var curMonth = new Date(data[i][0]).getMonth();
      var nextMonth = new Date(data[i + 1][0]).getMonth();
      if (curMonth !== nextMonth) {
        var rowNum = i + 2; // +2 because header row + 0-indexed
        sheet.getRange(rowNum, 1, 1, numCols).setBorder(null, null, true, null, null, null, '#1e40af', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
    } catch(e) {}
  }
}

/**
 * Ensure a month separator border is added when appending a new row.
 * Call after appendRow to check if the new row is in a different month than the previous.
 */
function ensureMonthSeparator(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 2) return; // Need at least 2 data rows
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var depDateIdx = headers.indexOf('Departure Date');
  if (depDateIdx < 0) return;
  
  var numCols = sheet.getLastColumn();
  var prevDateVal = sheet.getRange(lastRow - 1, depDateIdx + 1).getValue();
  var curDateVal = sheet.getRange(lastRow, depDateIdx + 1).getValue();
  
  try {
    var prevMonth = new Date(prevDateVal).getMonth();
    var curMonth = new Date(curDateVal).getMonth();
    if (prevMonth !== curMonth) {
      // Add thick border on bottom of previous row (month boundary)
      sheet.getRange(lastRow - 1, 1, 1, numCols).setBorder(null, null, true, null, null, null, '#1e40af', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  } catch(e) {
    Logger.log('ensureMonthSeparator error: ' + e.toString());
  }
}

// ============================================
// WEB APP HANDLERS | معالجات التطبيق
// ============================================

function invalidatePendingTripsCache() {
  try { CacheService.getScriptCache().remove('pending_trips_json'); } catch(e) {}
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
      
      case 'diagnosePendingTrips':
        return diagnosePendingTrips();
      
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
      
      case 'checkReminders':
        checkPendingTripsAndSendReminders();
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, message: 'Reminders checked and sent if needed' }))
          .setMimeType(ContentService.MimeType.JSON);
      
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
  Logger.log('submitCase called with data: ' + JSON.stringify(data));
  
  try {
    // Use lock to prevent duplicate processing from simultaneous requests
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    
    // Determine the year from departure date to write to the correct year sheet
    const depYear = data.departureDate ? new Date(data.departureDate).getFullYear() : new Date().getFullYear();
    const sheet = setupSheet(depYear);
    
    // Check if this case was already submitted (duplicate protection)
    const existingData = sheet.getDataRange().getValues();
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][3] === (data.driverName || '') && 
          existingData[i][4] === (data.staffNumber || '') && 
          existingData[i][5] === (data.departureDate || '') && 
          existingData[i][6] === (data.departureTime || '')) {
        // Already submitted - return success without sending emails again
        lock.releaseLock();
        Logger.log('Duplicate submitCase detected, skipping');
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            message: 'Case already submitted',
            id: existingData[i][0],
            duplicate: true
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // Use the pending trip's ID if provided, otherwise generate a new one
    const id = data.tripId ? data.tripId : getNextTripId();
    const timestamp = new Date();
    
    const rowData = [
      id,
      Utilities.formatDate(timestamp, CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'),
      data.vehicleNumber || '',
      data.driverName || '',
      data.staffNumber || '',
      data.departureDate || '',
      data.departureTime || '',
      data.returnDate || '',
      data.returnTime || '',
      data.destination || '',
      data.patientName || '',
      data.nurseName || '',
      data.nurseStaffNumber || ''
    ];
    
    // Append to sheet
    sheet.appendRow(rowData);
    
    // Add month separator if crossing month boundary
    ensureMonthSeparator(sheet);
    
    // Send email to admin only (nurses don't need email on submission)
    const emailResults = {
      adminEmail: false
    };
    
    Logger.log('Attempting to send admin email...');
    Logger.log('Admin email target: ' + CONFIG.ADMIN_EMAIL);
    
    try {
      sendAdminEmail(data);
      emailResults.adminEmail = true;
      Logger.log('Admin email sent successfully');
    } catch (emailError) {
      Logger.log('Admin email error: ' + emailError.toString());
      emailResults.adminEmailError = emailError.toString();
    }
    
    // Mark the pending trip as 'submitted' so admin can see the status change
    try {
      if (data.tripId) {
        markTripAsSubmitted(data.tripId);
        Logger.log('Pending trip marked as submitted: ' + data.tripId);
      } else {
        // Fallback: try to find by staff number and date
        deletePendingTripByStaffNumber(data.staffNumber, data.departureDate);
        Logger.log('Pending trip deleted for staff: ' + data.staffNumber);
      }
    } catch (deleteError) {
      Logger.log('Error updating pending trip: ' + deleteError.toString());
    }
    
    lock.releaseLock();
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: 'Case submitted successfully',
        id: id,
        emailsSent: emailResults
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
      for (var u = 1; u < usersData.length; u++) {
        var sNum = (usersData[u][4] || '').toString().trim();
        var civilId = (usersData[u][5] || '').toString().trim();
        var uNameEn = (usersData[u][3] || '').toString().trim();
        var uNameAr = (usersData[u][2] || '').toString().trim();
        if (sNum) {
          staffToNameEn[sNum] = uNameEn;
          staffToNameAr[sNum] = uNameAr;
        }
        if (civilId) {
          staffToNameEn[civilId] = uNameEn;
          staffToNameAr[civilId] = uNameAr;
        }
      }
      records.forEach(function(r) {
        // Resolve Nurse Name
        var nurseStaff = (r['Nurse Staff Number'] || '').toString().trim();
        var nurseName = (r['Nurse Name'] || '').toString().trim();
        if (nurseStaff && staffToNameEn[nurseStaff]) {
          r['Nurse Name'] = staffToNameEn[nurseStaff] || staffToNameAr[nurseStaff] || nurseName;
        } else if (nurseName && /^\d+$/.test(nurseName) && staffToNameEn[nurseName]) {
          r['Nurse Name'] = staffToNameEn[nurseName] || staffToNameAr[nurseName] || nurseName;
        }
        // Resolve Driver Name
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
        
        // Send notification email to nurses
        sendDeleteNotificationEmail(record, data.reason, 'deleted');
        
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            message: 'Record deleted successfully and notification sent'
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
      // Preserve existing Nurse Name and Nurse Staff Number if not provided in update
      const existingNurseName = sheetData[i][headers.indexOf('Nurse Name')] || '';
      const nurseName = (data.nurseName && data.nurseName.trim()) ? data.nurseName : existingNurseName;
      const nurseStaffIdx = headers.indexOf('Nurse Staff Number');
      const existingNurseStaff = nurseStaffIdx >= 0 ? (sheetData[i][nurseStaffIdx] || '') : '';
      const nurseStaffNumber = (data.nurseStaffNumber && data.nurseStaffNumber.trim()) ? data.nurseStaffNumber : existingNurseStaff;
      
      // Update the row with new data
      const rowData = [
        data.id, // ID stays the same
        Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'), // Update timestamp
        data.vehicleNumber || '',
        data.driverName || '',
        data.staffNumber || '',
        data.departureDate || '',
        data.departureTime || '',
        data.returnDate || '',
        data.returnTime || '',
        data.destination || '',
        data.patientName || '',
        nurseName,
        nurseStaffNumber
      ];
      
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
        
        // Send notification email to nurses
        sendDeleteNotificationEmail(record, data.reason, 'archived');
        
        return ContentService
          .createTextOutput(JSON.stringify({
            success: true,
            message: 'Record archived successfully and notification sent'
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
        <h1 style="margin: 0;">Ambulance Activity Log</h1>
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
            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${record['Nurse Name']}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: #eff6ff; padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">This is an automated notification from Hasik Health Center Ambulance Log System</p>
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
        for (var u = 1; u < usersData.length; u++) {
          var sNum = (usersData[u][4] || '').toString().trim();
          var civilId = (usersData[u][5] || '').toString().trim();
          var uNameEn = (usersData[u][3] || '').toString().trim();
          var uNameAr = (usersData[u][2] || '').toString().trim();
          if (sNum) {
            staffToNameEn[sNum] = uNameEn;
            staffToNameAr[sNum] = uNameAr;
          }
          if (civilId) {
            staffToNameEn[civilId] = uNameEn;
            staffToNameAr[civilId] = uNameAr;
          }
        }
        records.forEach(function(r) {
          // Resolve Nurse Name
          var nurseStaff = (r['Nurse Staff Number'] || '').toString().trim();
          var nurseName = (r['Nurse Name'] || '').toString().trim();
          if (nurseStaff && staffToNameEn[nurseStaff]) {
            r['Nurse Name'] = staffToNameEn[nurseStaff] || staffToNameAr[nurseStaff] || nurseName;
          } else if (nurseName && /^\d+$/.test(nurseName) && staffToNameEn[nurseName]) {
            r['Nurse Name'] = staffToNameEn[nurseName] || staffToNameAr[nurseName] || nurseName;
          }
          // Resolve Driver Name
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
        trips: trips
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
        var nameEnToCurrentEn = {};  // old/current nameEn (lowercase) → current nameEn
        for (var u = 1; u < usersData.length; u++) {
          var sNum = (usersData[u][4] || '').toString().trim();
          var civilId = (usersData[u][5] || '').toString().trim();
          var uNameEn = (usersData[u][3] || '').toString().trim();
          var uNameAr = (usersData[u][2] || '').toString().trim();
          if (sNum) {
            staffToNameEn[sNum] = uNameEn;
            staffToNameAr[sNum] = uNameAr;
          }
          if (civilId) {
            staffToNameEn[civilId] = uNameEn;
            staffToNameAr[civilId] = uNameAr;
          }
          // Build reverse map: any known English name → current English name
          if (uNameEn) {
            nameEnToCurrentEn[uNameEn.toLowerCase()] = uNameEn;
          }
        }
        records.forEach(function(r) {
          // Resolve Nurse Name
          var nurseStaff = (r['Nurse Staff Number'] || '').toString().trim();
          var nurseName = (r['Nurse Name'] || '').toString().trim();
          if (nurseStaff && staffToNameEn[nurseStaff]) {
            r['Nurse Name'] = staffToNameEn[nurseStaff] || staffToNameAr[nurseStaff] || nurseName;
          } else if (nurseName && /^\d+$/.test(nurseName) && staffToNameEn[nurseName]) {
            r['Nurse Name'] = staffToNameEn[nurseName] || staffToNameAr[nurseName] || nurseName;
          }
          // Resolve Driver Name
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
        userData: userData
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
        <h1 style="margin: 0;">Ambulance Activity Log</h1>
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
        <p style="margin: 0;">This is an automated notification from Hasik Health Center Ambulance Log System</p>
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
    
    // Generate sequential trip ID using global counter across all sheets
    const tripId = getNextTripId();
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
          // Update return date, time, and status (columns 8, 9, 10 in 1-indexed)
          sheet.getRange(i + 1, 8).setValue(data.returnDate);
          sheet.getRange(i + 1, 9).setValue(data.returnTime);
          sheet.getRange(i + 1, 10).setValue('complete');
          
          Logger.log('Updated row ' + (i + 1) + ' with returnDate=' + data.returnDate + ', returnTime=' + data.returnTime);
          
          // Get trip details for email - using correct column indices
          const tripData = {
            tripId: values[i][0],
            vehicleNumber: values[i][1],
            driverName: values[i][2],
            driverNameAr: values[i][3],
            staffNumber: values[i][4],
            departureDate: values[i][5],
            departureTime: values[i][6],
            returnDate: data.returnDate,
            returnTime: data.returnTime
          };
          
          // Send email to nurses
          try {
            sendTripCompleteEmailToNurse(tripData);
            Logger.log('Email sent to nurses for trip: ' + tripData.tripId);
          } catch (emailError) {
            Logger.log('Failed to send email to nurses: ' + emailError.toString());
          }
          
          lock.releaseLock();
          invalidatePendingTripsCache();
          return ContentService
            .createTextOutput(JSON.stringify({
              success: true,
              tripId: values[i][0],
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
        <p style="margin: 0;">Hasik Health Center - Ambulance Activity Log System</p>
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
    
    const result = JSON.stringify({ success: true, trips: trips });
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
 * Mark trip as submitted - تحديث حالة الرحلة بعد إرسالها
 */
function markTripAsSubmitted(tripId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PendingTrips');
    
    if (!sheet) return false;
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === tripId) {
        // Status is in column 10 (1-indexed) with new structure
        sheet.getRange(i + 1, 10).setValue('submitted');
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
          
          try {
            if (staffNumber && depDate) {
              deletePendingTripByStaffNumber(staffNumber, depDate);
            }
          } catch (pendingError) {
            Logger.log('Error cleaning PendingTrips after deleteRecord: ' + pendingError.toString());
          }
          
          return ContentService
            .createTextOutput(JSON.stringify({
              success: true,
              message: 'تم حذف السجل بنجاح',
              deletedId: idStr
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
        // Delete the row
        sheet.deleteRow(i + 1);
        Logger.log('Deleted trip: ' + tripIdStr);
        invalidatePendingTripsCache();
        
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
 * 🔍 DIAGNOSTIC FUNCTION - دالة التشخيص
 * Returns raw data from PendingTrips sheet for debugging
 */
function diagnosePendingTrips() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PendingTrips');
    
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          diagnosis: {
            sheetExists: false,
            message: 'PendingTrips sheet does not exist'
          }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          diagnosis: {
            sheetExists: true,
            hasData: false,
            lastRow: lastRow,
            message: 'Sheet exists but has no data rows'
          }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get headers
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    // Get all data rows with raw values
    const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const values = dataRange.getValues();
    
    // Build detailed diagnosis for each row
    const rowDiagnosis = values.map((row, index) => {
      const returnDateCell = row[6];
      const returnTimeCell = row[7];
      const statusCell = row[8];
      
      return {
        rowNumber: index + 2,
        tripId: row[0],
        driverName: row[1],
        driverNameAr: row[2],
        staffNumber: row[3],
        staffNumberType: typeof row[3],
        departureDate: row[4],
        departureDateType: typeof row[4],
        departureTime: row[5],
        returnDate: {
          value: returnDateCell,
          type: typeof returnDateCell,
          isEmpty: returnDateCell === '' || returnDateCell === null || returnDateCell === undefined,
          stringValue: returnDateCell ? returnDateCell.toString() : 'NULL'
        },
        returnTime: {
          value: returnTimeCell,
          type: typeof returnTimeCell,
          isEmpty: returnTimeCell === '' || returnTimeCell === null || returnTimeCell === undefined,
          stringValue: returnTimeCell ? returnTimeCell.toString() : 'NULL'
        },
        status: {
          value: statusCell,
          type: typeof statusCell,
          stringValue: statusCell ? statusCell.toString() : 'NULL'
        },
        createdAt: row[9]
      };
    });
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        diagnosis: {
          sheetExists: true,
          hasData: true,
          lastRow: lastRow,
          lastCol: lastCol,
          headers: headers,
          totalRows: values.length,
          rows: rowDiagnosis
        }
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        stack: error.stack
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
        <p style="margin: 0;">This is an automated reminder from Hasik Health Center Ambulance Log System</p>
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

/**
 * ========================================
 * سكريبت تشخيص مشكلة عدم تغيّر اسم الممرضة
 * Diagnostic: Why nurse name not updating
 * ========================================
 * شغّل هذه الدالة من Apps Script: Run > diagnoseNurseNameIssue
 * النتائج تظهر في View > Logs
 */
function diagnoseNurseNameIssue() {
  var LOG = [];
  function log(msg) { LOG.push(msg); Logger.log(msg); }
  
  log('========================================');
  log('🔍 بدء التشخيص - ' + new Date().toLocaleString('ar-OM', {timeZone: 'Asia/Muscat'}));
  log('========================================');
  
  // ===== 1. فحص جدول Users =====
  log('\n📋 [1] فحص جدول Users...');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    log('❌ جدول Users غير موجود!');
    return LOG.join('\n');
  }
  
  var usersData = usersSheet.getDataRange().getValues();
  var headers = usersData[0];
  log('✅ جدول Users موجود - عدد الصفوف: ' + (usersData.length - 1));
  log('   الأعمدة: ' + JSON.stringify(headers));
  
  // عرض كل الممرضات
  log('\n👩‍⚕️ [2] قائمة الممرضات في جدول Users:');
  var nurses = [];
  for (var i = 1; i < usersData.length; i++) {
    var row = usersData[i];
    if (row[1] === 'nurse') {
      var nurseInfo = {
        rowNum: i + 1,
        id: row[0],
        type: row[1],
        nameAr: row[2],
        nameEn: row[3],
        staffNumber: row[4],
        civilId: row[5],
        active: row[7]
      };
      nurses.push(nurseInfo);
      log('   صف ' + (i+1) + ': ID=' + row[0] + 
          ' | الاسم العربي="' + row[2] + '"' +
          ' | الاسم الإنجليزي="' + row[3] + '"' +
          ' | الرقم الوظيفي=' + row[4] +
          ' | الرقم المدني=' + row[5] +
          ' | نشط=' + row[7]);
    }
  }
  log('   إجمالي الممرضات: ' + nurses.length);
  
  // ===== 3. فحص جدول Records لأسماء الممرضات =====
  log('\n📊 [3] فحص أسماء الممرضات في جدول Records...');
  var recordsSheet = ss.getSheetByName(getRecordsSheetName());
  if (!recordsSheet || recordsSheet.getLastRow() <= 1) {
    log('⚠️ جدول Records فارغ أو غير موجود');
  } else {
    var recData = recordsSheet.getDataRange().getValues();
    var recHeaders = recData[0];
    
    // إيجاد أعمدة اسم الممرضة والرقم الوظيفي
    var nurseNameCol = recHeaders.indexOf('Nurse Name');
    var nurseStaffCol = recHeaders.indexOf('Nurse Staff Number');
    log('   عمود Nurse Name: ' + nurseNameCol + ' | عمود Nurse Staff Number: ' + nurseStaffCol);
    
    // بناء خريطة الأسماء المستخدمة
    var nameUsage = {};
    var staffToRecordNames = {};
    for (var r = 1; r < recData.length; r++) {
      var nurseName = (recData[r][nurseNameCol] || '').toString().trim();
      var nurseStaff = nurseStaffCol >= 0 ? (recData[r][nurseStaffCol] || '').toString().trim() : '';
      
      if (nurseName) {
        nameUsage[nurseName] = (nameUsage[nurseName] || 0) + 1;
      }
      if (nurseStaff) {
        if (!staffToRecordNames[nurseStaff]) staffToRecordNames[nurseStaff] = {};
        staffToRecordNames[nurseStaff][nurseName] = (staffToRecordNames[nurseStaff][nurseName] || 0) + 1;
      }
    }
    
    log('\n   📌 أسماء الممرضات المستخدمة في السجلات:');
    var nameKeys = Object.keys(nameUsage).sort(function(a,b){ return nameUsage[b] - nameUsage[a]; });
    nameKeys.forEach(function(name) {
      var isNumeric = /^\d+$/.test(name);
      log('   ' + (isNumeric ? '⚠️' : '  ') + ' "' + name + '" → ' + nameUsage[name] + ' سجل' + (isNumeric ? ' (رقم وظيفي!)' : ''));
    });
    
    log('\n   📌 ربط الرقم الوظيفي بالأسماء في السجلات:');
    Object.keys(staffToRecordNames).forEach(function(staff) {
      var names = Object.keys(staffToRecordNames[staff]);
      var matched = nurses.filter(function(n){ return n.staffNumber && n.staffNumber.toString() === staff; });
      var currentName = matched.length > 0 ? matched[0].nameEn : '(غير موجود في Users)';
      log('   رقم ' + staff + ' → الاسم الحالي في Users: "' + currentName + '"');
      names.forEach(function(n) {
        var match = (n === currentName);
        log('      ' + (match ? '✅' : '❌') + ' في السجلات: "' + n + '" (' + staffToRecordNames[staff][n] + ' سجل)' + (!match ? ' ← مختلف!' : ''));
      });
    });
  }
  
  // ===== 4. فحص مقارنة أنواع البيانات في updateUser =====
  log('\n🔧 [4] فحص أنواع البيانات (ID comparison في updateUser)...');
  for (var j = 1; j < usersData.length && j <= 5; j++) {
    var idVal = usersData[j][0];
    log('   صف ' + (j+1) + ': ID=' + JSON.stringify(idVal) + ' | نوعه=' + typeof idVal + 
        ' | الاسم=' + usersData[j][2]);
  }
  log('   ⚠️ ملاحظة: updateUser يقارن بـ === لذلك إذا كان ID رقم في الجدول ونص في الطلب، لن يتطابقا!');
  
  // ===== 5. محاكاة validateUser لكل ممرضة =====
  log('\n🔐 [5] محاكاة validateUser لكل ممرضة:');
  nurses.forEach(function(nurse) {
    var staffNum = nurse.staffNumber ? nurse.staffNumber.toString() : '';
    if (staffNum) {
      var result = validateUser(staffNum);
      if (result.success) {
        log('   ✅ رقم ' + staffNum + ' → nameAr="' + result.user.nameAr + '" nameEn="' + result.user.nameEn + '"');
      } else {
        log('   ❌ رقم ' + staffNum + ' → فشل: ' + result.error);
      }
    }
  });
  
  // ===== 6. فحص getNurseData لكل ممرضة =====
  log('\n📡 [6] محاكاة getNurseData userData لكل ممرضة:');
  nurses.forEach(function(nurse) {
    var staffNum = nurse.staffNumber ? nurse.staffNumber.toString() : '';
    if (staffNum) {
      try {
        var params = { year: new Date().getFullYear().toString(), staffNumber: staffNum };
        // نفحص فقط validateUser لأنها نفسها المستخدمة داخل getNurseData
        var userResult = validateUser(staffNum);
        if (userResult.success) {
          log('   ✅ getNurseData userData لرقم ' + staffNum + ':');
          log('      nameAr="' + userResult.user.nameAr + '" nameEn="' + userResult.user.nameEn + '"');
          log('      type="' + userResult.user.type + '" id=' + JSON.stringify(userResult.user.id));
        }
      } catch(e) {
        log('   ❌ خطأ: ' + e.toString());
      }
    }
  });
  
  // ===== 7. فحص مشكلة مقارنة ID =====
  log('\n⚠️ [7] فحص مشكلة المقارنة في updateUser:');
  for (var k = 1; k < usersData.length; k++) {
    var rawId = usersData[k][0];
    var strId = rawId ? rawId.toString() : '';
    var isMatch_strict = (rawId === strId);
    var isMatch_loose = (rawId == strId);
    if (usersData[k][1] === 'nurse') {
      log('   صف ' + (k+1) + ': rawId=' + JSON.stringify(rawId) + ' typeof=' + typeof rawId +
          ' | === "' + strId + '": ' + isMatch_strict +
          ' | == "' + strId + '": ' + isMatch_loose +
          ' | الاسم: ' + usersData[k][2]);
      if (!isMatch_strict && isMatch_loose) {
        log('   🚨 هذا هو السبب! updateUser يستخدم === لكن ID رقم والطلب يرسل نص!');
      }
    }
  }
  
  log('\n========================================');
  log('✅ انتهى التشخيص');
  log('========================================');
  
  return LOG.join('\n');
}

/**
 * ========================================
 * إصلاح شامل لأسماء الممرضات والسائقين في السجلات القديمة
 * Backfill: fix names + add Nurse Staff Number to old records
 * ========================================
 * شغّل هذه الدالة من Apps Script: Run > backfillNurseStaffNumbers
 * النتائج تظهر في View > Execution log
 */
function backfillNurseStaffNumbers() {
  var LOG = [];
  function log(msg) { LOG.push(msg); Logger.log(msg); }
  
  log('========================================');
  log('🔧 بدء إصلاح أسماء الممرضات والسائقين في السجلات');
  log('========================================');
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) { log('❌ جدول Users غير موجود!'); return LOG.join('\n'); }
  var usersData = usersSheet.getDataRange().getValues();
  
  // بناء قوائم الممرضات والسائقين من Users
  var nurseLookup = [];
  var driverLookup = [];
  for (var u = 1; u < usersData.length; u++) {
    var userInfo = {
      nameEn: (usersData[u][3] || '').toString().trim(),
      nameAr: (usersData[u][2] || '').toString().trim(),
      staffNumber: (usersData[u][4] || '').toString().trim(),
      civilId: (usersData[u][5] || '').toString().trim()
    };
    if (usersData[u][1] === 'nurse') nurseLookup.push(userInfo);
    if (usersData[u][1] === 'driver') driverLookup.push(userInfo);
  }
  log('   عدد الممرضات: ' + nurseLookup.length + ' | عدد السائقين: ' + driverLookup.length);
  
  var recordsSheet = ss.getSheetByName(getRecordsSheetName());
  if (!recordsSheet || recordsSheet.getLastRow() <= 1) {
    log('⚠️ جدول Records فارغ'); return LOG.join('\n');
  }
  
  var recHeaders = recordsSheet.getRange(1, 1, 1, recordsSheet.getLastColumn()).getValues()[0];
  var nurseNameCol = recHeaders.indexOf('Nurse Name');
  var nurseStaffCol = recHeaders.indexOf('Nurse Staff Number');
  var driverNameCol = recHeaders.indexOf('Driver Name');
  var driverStaffCol = recHeaders.indexOf('Staff Number');
  
  var lastRow = recordsSheet.getLastRow();
  var recData = recordsSheet.getRange(2, 1, lastRow - 1, recHeaders.length).getValues();
  var fixed = 0;
  var nameFixed = 0;
  
  // دالة مطابقة شاملة
  function findMatch(name, lookup) {
    if (!name) return null;
    var nameLower = name.toLowerCase();
    // 1: اسم إنجليزي بالضبط
    for (var a = 0; a < lookup.length; a++) {
      if (lookup[a].nameEn.toLowerCase() === nameLower) return lookup[a];
    }
    // 2: اسم عربي بالضبط
    for (var b = 0; b < lookup.length; b++) {
      if (lookup[b].nameAr === name) return lookup[b];
    }
    // 3: الاسم رقم وظيفي
    if (/^\d+$/.test(name)) {
      for (var c = 0; c < lookup.length; c++) {
        if (lookup[c].staffNumber === name || lookup[c].civilId === name) return lookup[c];
      }
    }
    // 4: الاسم الأول مشترك
    var firstWord = nameLower.split(/\s+/)[0];
    if (firstWord.length >= 3) {
      for (var d = 0; d < lookup.length; d++) {
        var userFirst = lookup[d].nameEn.toLowerCase().split(/\s+/)[0];
        if (userFirst === firstWord) return lookup[d];
      }
    }
    return null;
  }
  
  // === مرحلة 1: مطابقة مباشرة ===
  log('\n📋 مرحلة 1: مطابقة مباشرة...');
  var unmatchedRows = []; // {rowNum, nurseName} — السجلات التي لم تُطابق
  var matchedStaffNums = {}; // الأرقام الوظيفية التي تم مطابقتها بالفعل
  
  for (var r = 0; r < recData.length; r++) {
    var nurseName = nurseNameCol >= 0 ? (recData[r][nurseNameCol] || '').toString().trim() : '';
    var nurseStaff = nurseStaffCol >= 0 ? (recData[r][nurseStaffCol] || '').toString().trim() : '';
    var driverName = driverNameCol >= 0 ? (recData[r][driverNameCol] || '').toString().trim() : '';
    var driverStaff = driverStaffCol >= 0 ? (recData[r][driverStaffCol] || '').toString().trim() : '';
    var rowNum = r + 2;
    
    // إصلاح اسم الممرضة
    if (nurseName && nurseNameCol >= 0) {
      if (nurseStaff) {
        // لديها رقم وظيفي — تحديث الاسم فقط
        var matchByStaff = nurseLookup.filter(function(n) { return n.staffNumber === nurseStaff || n.civilId === nurseStaff; });
        if (matchByStaff.length > 0) {
          matchedStaffNums[matchByStaff[0].staffNumber] = true;
          if (matchByStaff[0].nameEn && matchByStaff[0].nameEn !== nurseName) {
            log('   📝 صف ' + rowNum + ': تحديث "' + nurseName + '" → "' + matchByStaff[0].nameEn + '"');
            recordsSheet.getRange(rowNum, nurseNameCol + 1).setValue(matchByStaff[0].nameEn);
            nameFixed++;
          }
        }
      } else {
        // بدون رقم وظيفي — نحاول المطابقة
        var matched = findMatch(nurseName, nurseLookup);
        if (matched) {
          var sn = matched.staffNumber || matched.civilId;
          matchedStaffNums[matched.staffNumber] = true;
          log('   ✅ صف ' + rowNum + ': "' + nurseName + '" → ' + sn);
          if (nurseStaffCol >= 0) { recordsSheet.getRange(rowNum, nurseStaffCol + 1).setValue(sn); fixed++; }
          if (matched.nameEn && matched.nameEn !== nurseName) {
            recordsSheet.getRange(rowNum, nurseNameCol + 1).setValue(matched.nameEn);
            nameFixed++;
            log('      📝 → "' + matched.nameEn + '"');
          }
        } else {
          unmatchedRows.push({rowNum: rowNum, nurseName: nurseName});
        }
      }
    }
    
    // إصلاح اسم السائق
    if (driverName && driverStaff && driverNameCol >= 0) {
      var drvMatch = driverLookup.filter(function(d) { return d.staffNumber === driverStaff || d.civilId === driverStaff; });
      if (drvMatch.length > 0 && drvMatch[0].nameEn && drvMatch[0].nameEn !== driverName) {
        log('   🚗 صف ' + rowNum + ': سائق "' + driverName + '" → "' + drvMatch[0].nameEn + '"');
        recordsSheet.getRange(rowNum, driverNameCol + 1).setValue(drvMatch[0].nameEn);
        nameFixed++;
      }
    }
  }
  
  // === مرحلة 2: مطابقة بالاستبعاد — السجلات المتبقية ===
  if (unmatchedRows.length > 0) {
    log('\n📋 مرحلة 2: مطابقة بالاستبعاد (' + unmatchedRows.length + ' سجل غير مطابق)...');
    // الممرضات اللي ما ظهرن في أي سجل
    var unmatchedNurses = nurseLookup.filter(function(n) { return !matchedStaffNums[n.staffNumber]; });
    log('   ممرضات بدون سجلات مطابقة: ' + unmatchedNurses.length);
    
    // إذا عدد السجلات غير المطابقة = عدد الممرضات غير المطابقة = 1 → ربط تلقائي
    if (unmatchedRows.length === 1 && unmatchedNurses.length === 1) {
      var ur = unmatchedRows[0];
      var un = unmatchedNurses[0];
      var sn2 = un.staffNumber || un.civilId;
      log('   ⚡ مطابقة بالاستبعاد: "' + ur.nurseName + '" → ' + un.nameEn + ' (' + sn2 + ')');
      if (nurseStaffCol >= 0) { recordsSheet.getRange(ur.rowNum, nurseStaffCol + 1).setValue(sn2); fixed++; }
      if (un.nameEn && un.nameEn !== ur.nurseName) {
        recordsSheet.getRange(ur.rowNum, nurseNameCol + 1).setValue(un.nameEn);
        nameFixed++;
        log('      📝 → "' + un.nameEn + '"');
      }
      unmatchedRows = [];
    }
    
    // عرض أي سجلات لا تزال غير مطابقة
    unmatchedRows.forEach(function(ur) {
      log('   ❓ صف ' + ur.rowNum + ': "' + ur.nurseName + '" — يحتاج ربط يدوي');
    });
  }
  
  log('\n========================================');
  log('✅ انتهى! Nurse Staff Number: ' + fixed + ' سجل | تحديث أسماء: ' + nameFixed + ' سجل');
  log('========================================');
  
  return LOG.join('\n');
}

/**
 * ربط اسم قديم في السجلات برقم وظيفي محدد
 * Generic: works for any old name → any staff number
 * 
 * استخدام: عدّل OLD_NAME و STAFF_NUMBER أدناه ثم شغّل: Run > linkRecordName
 */
function linkRecordName() {
  // ====== عدّل هنا ======
  var OLD_NAME = 'ANU MAMOOTIL MATHAI';   // الاسم القديم في السجل
  var STAFF_NUMBER = '88973';              // الرقم الوظيفي الصحيح
  // =======================
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // جلب الاسم الحالي من Users
  var usersSheet = ss.getSheetByName('Users');
  var usersData = usersSheet.getDataRange().getValues();
  var currentNameEn = '';
  for (var u = 1; u < usersData.length; u++) {
    var sn = (usersData[u][4] || '').toString().trim();
    var ci = (usersData[u][5] || '').toString().trim();
    if (sn === STAFF_NUMBER || ci === STAFF_NUMBER) {
      currentNameEn = (usersData[u][3] || '').toString().trim();
      break;
    }
  }
  
  if (!currentNameEn) {
    Logger.log('❌ لم يتم العثور على مستخدم بالرقم ' + STAFF_NUMBER);
    return;
  }
  
  // تحديث السجلات
  var recSheet = ss.getSheetByName(getRecordsSheetName());
  var recHeaders = recSheet.getRange(1, 1, 1, recSheet.getLastColumn()).getValues()[0];
  var nurseNameCol = recHeaders.indexOf('Nurse Name');
  var nurseStaffCol = recHeaders.indexOf('Nurse Staff Number');
  var recData = recSheet.getRange(2, 1, recSheet.getLastRow() - 1, recHeaders.length).getValues();
  var count = 0;
  
  for (var r = 0; r < recData.length; r++) {
    var name = (recData[r][nurseNameCol] || '').toString().trim();
    if (name.toLowerCase() === OLD_NAME.toLowerCase()) {
      var rowNum = r + 2;
      recSheet.getRange(rowNum, nurseNameCol + 1).setValue(currentNameEn);
      if (nurseStaffCol >= 0) recSheet.getRange(rowNum, nurseStaffCol + 1).setValue(STAFF_NUMBER);
      count++;
      Logger.log('✅ صف ' + rowNum + ': "' + name + '" → "' + currentNameEn + '" (رقم ' + STAFF_NUMBER + ')');
    }
  }
  
  Logger.log('✅ تم تحديث ' + count + ' سجل');
}
