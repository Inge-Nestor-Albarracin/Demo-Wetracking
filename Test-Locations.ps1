param([string]$BaseUrl = 'http://localhost:3000')

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

function Send-Json([string]$Path, [hashtable]$Data) {
    Invoke-RestMethod -Uri "$BaseUrl$Path" -Method Post `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([System.Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json)))
}

function Assert-PostStatus([string]$Path, [hashtable]$Data, [int]$Expected) {
    $received = $null
    try {
        $null = Send-Json $Path $Data
    }
    catch {
        if ($null -eq $_.Exception.Response) { throw }
        $received = [int]$_.Exception.Response.StatusCode
    }
    if ($received -ne $Expected) {
        throw "Expected HTTP $Expected at $Path; received '$received'"
    }
}

# A unique test branch avoids conflicts if the script is repeated.
# These records remain in the local development database.
$testCode = 'TEST-' + [guid]::NewGuid().ToString('N').Substring(0, 8).ToUpperInvariant()

$branch = Send-Json '/locations/branches' @{
    code = $testCode
    name = 'Sucursal de prueba'
}

$location = Send-Json '/locations/inventory-locations' @{
    branchId = $branch.id
    code = 'BODEGA-TEST'
    name = 'Bodega de prueba'
    type = 'WAREHOUSE'
}

$aisle = Send-Json '/locations/aisles' @{
    inventoryLocationId = $location.id
    number = 12
    floorNumber = 4
}

$rack = Send-Json '/locations/racks' @{
    aisleId = $aisle.id
    number = 7
}

$branches = Invoke-RestMethod "$BaseUrl/locations/branches"
if (@($branches | Where-Object { $_.id -eq $branch.id }).Count -ne 1) {
    throw 'Created branch missing from list'
}

$locations = Invoke-RestMethod "$BaseUrl/locations/branches/$($branch.id)/inventory-locations"
if (@($locations | Where-Object { $_.id -eq $location.id -and $_.branchId -eq $branch.id }).Count -ne 1) {
    throw 'Location hierarchy check failed'
}

$aisles = Invoke-RestMethod "$BaseUrl/locations/inventory-locations/$($location.id)/aisles"
if (@($aisles | Where-Object { $_.id -eq $aisle.id -and $_.inventoryLocationId -eq $location.id }).Count -ne 1) {
    throw 'Aisle hierarchy check failed'
}

$racks = Invoke-RestMethod "$BaseUrl/locations/aisles/$($aisle.id)/racks"
if (@($racks | Where-Object { $_.id -eq $rack.id -and $_.aisleId -eq $aisle.id }).Count -ne 1) {
    throw 'Rack hierarchy check failed'
}

Assert-PostStatus '/locations/racks' @{ aisleId = $aisle.id; number = 7 } 409
Assert-PostStatus '/locations/racks' @{ aisleId = $aisle.id; number = 0 } 400
Assert-PostStatus '/locations/inventory-locations' @{
    branchId = 'DOES-NOT-EXIST'; code = 'MISSING'; name = 'Prueba'
} 404

Write-Host 'OK: creation, hierarchy, duplicate (409), invalid number (400), missing parent (404).'
[pscustomobject]@{
    branchId = $branch.id
    inventoryLocationId = $location.id
    aisleId = $aisle.id
    rackId = $rack.id
}
