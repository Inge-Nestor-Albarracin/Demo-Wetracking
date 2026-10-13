param([string]$BaseUrl = 'http://localhost:3000')

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

function Send-Request {
    param([string]$Method, [string]$Path, [hashtable]$Headers = @{}, [hashtable]$Data)
    $options = @{ Uri = "$BaseUrl$Path"; Method = $Method; Headers = $Headers; ErrorAction = 'Stop' }
    if ($null -ne $Data) {
        $options.ContentType = 'application/json; charset=utf-8'
        $options.Body = [System.Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json))
    }
    Invoke-RestMethod @options
}

function Assert-Status {
    param([string]$Method, [string]$Path, [int]$Expected, [hashtable]$Headers = @{}, [hashtable]$Data)
    $received = $null
    try { $null = Send-Request -Method $Method -Path $Path -Headers $Headers -Data $Data }
    catch {
        if ($null -eq $_.Exception.Response) { throw }
        $received = [int]$_.Exception.Response.StatusCode
    }
    if ($received -ne $Expected) { throw "Expected HTTP $Expected at $Path; received '$received'" }
}

function Assert-NoPassword($Object) {
    if ($Object.PSObject.Properties.Name -contains 'passwordHash' -or
        $Object.PSObject.Properties.Name -contains 'password') {
        throw 'Response exposes password data'
    }
}

$adminEmail = Read-Host 'Correo del administrador'
$securePassword = Read-Host 'Contrasena del administrador' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    Assert-Status -Method Get -Path '/locations/branches' -Expected 401
    Assert-Status -Method Get -Path '/auth/me' -Expected 401 -Headers @{ Authorization = 'Bearer invalid-token' }

    $session = Send-Request -Method Post -Path '/auth/login' -Data @{ email = $adminEmail; password = $adminPassword }
    if (-not $session.access_token -or $session.user.role -ne 'ADMIN') { throw 'Admin login failed' }
    Assert-NoPassword $session.user
    $adminHeaders = @{ Authorization = "Bearer $($session.access_token)" }
    $me = Send-Request -Method Get -Path '/auth/me' -Headers $adminHeaders
    if ($me.id -ne $session.user.id) { throw 'Wrong authenticated user' }
    Assert-NoPassword $me

    $null = Send-Request -Method Get -Path '/locations/branches' -Headers $adminHeaders
    $null = Send-Request -Method Get -Path '/catalog/references' -Headers $adminHeaders
    $null = Send-Request -Method Get -Path '/catalog/finishes' -Headers $adminHeaders
    $health = Send-Request -Method Get -Path '/health/database' -Headers $adminHeaders
    if ($health.database -ne 'connected') { throw 'Database health failed' }

    Assert-Status -Method Post -Path '/auth/login' -Expected 401 -Data @{
        email = $adminEmail; password = ([guid]::NewGuid().ToString('N'))
    }

    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 10)
    $testEmail = "auth-test-$suffix@example.invalid"
    $testPassword = 'Test-' + [guid]::NewGuid().ToString('N')
    $userData = @{ name = 'Usuario prueba autenticacion'; email = $testEmail; password = $testPassword; role = 'READ_ONLY' }
    $testUser = Send-Request -Method Post -Path '/users' -Headers $adminHeaders -Data $userData
    Assert-NoPassword $testUser
    Assert-Status -Method Post -Path '/users' -Expected 409 -Headers $adminHeaders -Data $userData
    Assert-Status -Method Post -Path '/users' -Expected 400 -Headers $adminHeaders -Data @{
        name = 'Prueba'; email = "weak-$suffix@example.invalid"; password = 'short'; role = 'READ_ONLY'
    }

    $reader = Send-Request -Method Post -Path '/auth/login' -Data @{ email = $testEmail; password = $testPassword }
    $readerHeaders = @{ Authorization = "Bearer $($reader.access_token)" }
    $null = Send-Request -Method Get -Path '/locations/branches' -Headers $readerHeaders
    Assert-Status -Method Get -Path '/users' -Expected 403 -Headers $readerHeaders
    Assert-Status -Method Post -Path '/locations/branches' -Expected 403 -Headers $readerHeaders -Data @{
        code = 'MUST-NOT-BE-CREATED'; name = 'Operacion prohibida'
    }
    Assert-Status -Method Patch -Path "/users/$($testUser.id)/active" -Expected 403 -Headers $readerHeaders -Data @{ active = $false }

    Assert-Status -Method Patch -Path "/users/$($me.id)/active" -Expected 400 -Headers $adminHeaders -Data @{ active = $false }
    $disabled = Send-Request -Method Patch -Path "/users/$($testUser.id)/active" -Headers $adminHeaders -Data @{ active = $false }
    if ($disabled.active -ne $false) { throw 'Deactivation failed' }
    Assert-Status -Method Get -Path '/auth/me' -Expected 401 -Headers $readerHeaders
    Assert-Status -Method Post -Path '/auth/login' -Expected 401 -Data @{ email = $testEmail; password = $testPassword }

    $users = Send-Request -Method Get -Path '/users' -Headers $adminHeaders
    foreach ($user in $users) { Assert-NoPassword $user }
    Write-Host 'OK: login, protected endpoints, roles, safe responses, duplicate email, password validation and inactive user.'
    Write-Host "Test account remains inactive: $testEmail"
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $adminPassword = $null
    $testPassword = $null
    $session = $null
    $reader = $null
    $adminHeaders = $null
    $readerHeaders = $null
}
