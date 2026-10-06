Get-CimInstance Win32_Process -Filter "name='node.exe'" | ForEach-Object {
  $cmd = $_.CommandLine
  if ($null -eq $cmd) { $cmd = '' }
  $len = [Math]::Min(140, $cmd.Length)
  "{0}`t{1}" -f $_.ProcessId, $cmd.Substring(0, $len)
} | Out-String -Width 200
